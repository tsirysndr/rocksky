use crate::{
    repo::save_scrobble,
    source::{Frame, Source, Version},
    types::{Commit, Root},
    webhook_worker::AppState,
};
use anyhow::Error;
use futures_util::StreamExt;
use owo_colors::OwoColorize;
use rocksky_submissions::queue::{ClaimLane, InboxEvent};
use rocksky_submissions::{
    worker::{self, Failure, Settings},
    Job, Queue,
};
use std::{env, sync::Arc, time::Duration};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio_util::sync::CancellationToken;
use tracing::Instrument;

const INBOX_KIND: &str = "jetstream.commit.v1";

pub const SCROBBLE_NSID: &str = "app.rocksky.scrobble";
pub const ARTIST_NSID: &str = "app.rocksky.artist";
pub const ALBUM_NSID: &str = "app.rocksky.album";
pub const SONG_NSID: &str = "app.rocksky.song";
pub const PLAYLIST_NSID: &str = "app.rocksky.playlist";
pub const PLAYLIST_SONG_NSID: &str = "app.rocksky.playlist.song";
pub const LIKE_NSID: &str = "app.rocksky.like";
pub const SHOUT_NSID: &str = "app.rocksky.shout";
pub const FEED_GENERATOR_NSID: &str = "app.rocksky.feed.generator";
pub const FOLLOW_NSID: &str = "app.rocksky.graph.follow";
pub const EVENT_MUSIC_NSID: &str = "app.rocksky.event.music";
pub const CALENDAR_EVENT_NSID: &str = "community.lexicon.calendar.event";
pub const CALENDAR_RSVP_NSID: &str = "community.lexicon.calendar.rsvp";

/// The collections outside `app.rocksky.*` the firehose subscription asks for.
/// Jetstream takes one `wantedCollections` per collection and does not accept
/// a prefix wildcard for a foreign namespace, so each is spelled out.
pub const EXTRA_COLLECTIONS: [&str; 2] = [CALENDAR_EVENT_NSID, CALENDAR_RSVP_NSID];

/// Captures each source into a durable inbox before advancing its cursor.
/// Duplicate source events share a job; interrupted indexing is retried.
pub struct MultiSourceSubscriber {
    servers: Vec<Source>,
}

impl MultiSourceSubscriber {
    pub fn with_sources(servers: Vec<Source>) -> Self {
        Self { servers }
    }

    pub fn new(servers: Vec<String>) -> Self {
        Self::with_sources(
            servers
                .into_iter()
                .map(|server| {
                    Source::new(Version::V1, &server, initial_cursor())
                        .expect("invalid Jetstream source")
                })
                .collect(),
        )
    }

    pub async fn run(&self, state: Arc<Mutex<AppState>>) -> Result<(), Error> {
        if self.servers.is_empty() {
            anyhow::bail!("MultiSourceSubscriber: no JETSTREAM servers configured");
        }

        // Match apps/api/src/drizzle.ts (max: 20, connectionTimeoutMillis: 10_000)
        // — that's the established per-process budget for long-lived services
        // against this Xata Postgres. Bump via env if the tier allows more.
        let max_connections: u32 = env::var("PG_MAX_CONNECTIONS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(20);
        let max_inflight: usize = env::var("MAX_INFLIGHT_SCROBBLES")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(64);
        let reserved = env::var("JETSTREAM_SCROBBLE_CONCURRENCY")
            .ok()
            .map(|value| value.parse::<usize>())
            .transpose()?;
        let (scrobble_workers, background_workers) = worker_capacity(max_inflight, reserved)?;
        let per_did = env::var("JETSTREAM_MAX_INFLIGHT_PER_DID")
            .ok()
            .map(|value| value.parse::<i64>())
            .transpose()?
            .unwrap_or(4);
        anyhow::ensure!(
            (1..=256).contains(&per_did),
            "JETSTREAM_MAX_INFLIGHT_PER_DID must be between 1 and 256"
        );
        // Ingest: everything here writes, so it always talks to the primary.
        // Postgres when one is configured — keeping the pool budget and the
        // read-only check, since this service exists to write and must refuse
        // to start rather than drop every record into a replica — and
        // otherwise the shared SQLite file.
        let db = rocksky_pgurl::connect_handle("rocksky-jetstream", |opts| {
            // Match apps/api/src/drizzle.ts: the established per-process
            // budget against this Postgres.
            opts.max_connections(max_connections)
                .min_connections(2)
                .acquire_timeout(Duration::from_secs(10))
                .max_lifetime(Some(Duration::from_secs(60 * 14)))
                .test_before_acquire(true)
        })
        .await?;
        tracing::info!(database = %db.source(), "jetstream database");
        let pool = Arc::new(db.primary().clone());

        let addr = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
        let nc = Arc::new(async_nats::connect(&addr).await?);

        let queue = Queue::from_env().await?;
        queue.prepare_fairness(INBOX_KIND).await?;
        let shutdown = CancellationToken::new();
        let mut tasks = tokio::task::JoinSet::new();
        tracing::info!(
            scrobble_workers,
            background_workers,
            per_did,
            "Jetstream priority lanes enabled"
        );
        for (lane, concurrency) in [
            (ClaimLane::Scrobbles, scrobble_workers),
            (ClaimLane::Background, background_workers),
        ] {
            let process_queue = queue.clone();
            let (state, pool, nc) = (state.clone(), pool.clone(), nc.clone());
            tasks.spawn(worker::run_fair_lane(
                queue.clone(),
                INBOX_KIND,
                lane,
                concurrency,
                per_did,
                Settings::default(),
                shutdown.clone(),
                move |job| {
                    index_event(
                        process_queue.clone(),
                        state.clone(),
                        pool.clone(),
                        nc.clone(),
                        job,
                    )
                },
            ));
        }
        let (inbox_tx, inbox_rx) = mpsc::channel(2048);
        let writer_queue = queue.clone();
        tasks.spawn(async move {
            run_inbox_writer(writer_queue, inbox_rx).await;
        });
        for (idx, server) in self.servers.iter().enumerate() {
            let (server, queue) = (server.clone(), queue.clone());
            let inbox_tx = inbox_tx.clone();
            tasks.spawn(async move {
                run_connection_worker(idx, server, queue, inbox_tx).await;
            });
        }
        // These tasks run continuously. Unexpected termination must restart the
        // service, not leave an apparently healthy process with no ingestion.
        let result = tasks.join_next().await;
        shutdown.cancel();
        tasks.abort_all();
        anyhow::bail!("jetstream task exited unexpectedly: {result:?}")
    }
}

fn dedup_key(did: &str, commit: &Commit) -> String {
    // (did, collection, rkey, rev) uniquely identifies a commit at its source
    // PDS; every jetstream server forwards the same tuple, so this collapses
    // duplicates regardless of which server delivered first.
    format!(
        "{}|{}|{}|{}",
        did, commit.collection, commit.rkey, commit.rev
    )
}

async fn run_connection_worker(
    idx: usize,
    server: Source,
    queue: Queue,
    inbox: mpsc::Sender<InboxEvent>,
) {
    // Independent checkpoints: the fastest source cannot move a lagging peer
    // past events it has not yet durably captured.
    let source = server.cursor_key();
    let version = server.version.label();
    loop {
        let cursor = match queue.cursor(&source).await {
            Ok(cursor) => cursor.unwrap_or(0),
            Err(error) => {
                tracing::error!(%error, jetstream.version=version, jetstream.source=%source, "cannot load durable Jetstream cursor");
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
        };
        let request = server.request(cursor).expect("validated Jetstream source");
        tracing::info!(worker=idx, jetstream.version=version, jetstream.source=%source, url=%request.uri().to_string().bright_green(), "Connecting to jetstream");
        match tokio::time::timeout(Duration::from_secs(15), connect_async(request)).await {
            Ok(Ok((mut stream, _))) => {
                loop {
                    let frame = match tokio::time::timeout(Duration::from_secs(60), stream.next())
                        .await
                    {
                        Ok(Some(frame)) => frame,
                        Ok(None) => break,
                        Err(_) => {
                            tracing::warn!(
                                worker = idx, jetstream.version=version, jetstream.source=%source,
                                "Jetstream connection idle; reconnecting from durable cursor"
                            );
                            break;
                        }
                    };
                    let text = match frame {
                        Ok(Message::Text(text)) => text,
                        Ok(Message::Close(_)) | Err(_) => break,
                        _ => continue,
                    };
                    let (message, event_cursor) = match server.decode(&text) {
                        Ok(Frame::Commit { event, cursor }) => (event, cursor),
                        Ok(Frame::Ignore) => continue,
                        Ok(Frame::Info(name)) => {
                            tracing::info!(worker=idx, jetstream.version=version, jetstream.source=%source, %name, "Jetstream notice");
                            continue;
                        }
                        Ok(Frame::Error(name)) => {
                            tracing::error!(worker=idx, jetstream.version=version, jetstream.source=%source, %name, "Jetstream stream error; reconnecting without advancing cursor");
                            break;
                        }
                        Err(error) => {
                            tracing::error!(%error, jetstream.version=version, jetstream.source=%source, "malformed Jetstream frame");
                            // Retain poison messages for inspection instead of
                            // silently losing them when a later cursor advances.
                            let key =
                                format!("malformed:{}", rocksky_submissions::queue::digest(&text));
                            if inbox
                                .send(InboxEvent {
                                    source: source.clone(),
                                    cursor: 0,
                                    key,
                                    payload: text.to_string(),
                                })
                                .await
                                .is_err()
                            {
                                break;
                            }
                            continue;
                        }
                    };
                    if message.kind != "commit" {
                        continue;
                    }
                    let Some(ref commit) = message.commit else {
                        continue;
                    };
                    let key = dedup_key(&message.did, commit);
                    // This buffer is bounded and does NOT acknowledge a cursor.
                    // If the process dies, uncommitted events replay from the DB.
                    if inbox
                        .send(InboxEvent {
                            source: source.clone(),
                            cursor: event_cursor,
                            key,
                            payload: serde_json::to_string(&message)
                                .expect("serializable Jetstream event"),
                        })
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
            }
            Ok(Err(error)) => {
                tracing::error!(%error, worker=idx, jetstream.version=version, jetstream.source=%source, "Jetstream connection failed")
            }
            Err(_) => {
                tracing::warn!(worker = idx, jetstream.version=version, jetstream.source=%source, "Jetstream connection timed out")
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

/// Shared bounded batch writer amortizes remote DB latency across all feeds.
async fn run_inbox_writer(queue: Queue, mut inbox: mpsc::Receiver<InboxEvent>) {
    while let Some(first) = inbox.recv().await {
        let mut batch = vec![first];
        let deadline = tokio::time::Instant::now() + Duration::from_millis(25);
        while batch.len() < 256 {
            match tokio::time::timeout_at(deadline, inbox.recv()).await {
                Ok(Some(event)) => batch.push(event),
                _ => break,
            }
        }
        loop {
            match tokio::time::timeout(
                Duration::from_secs(15),
                queue.ingest_batch(INBOX_KIND, &batch),
            )
            .await
            {
                Ok(Ok(())) => break,
                Ok(Err(error)) => {
                    tracing::error!(%error, events=batch.len(), "inbox batch failed; retrying without advancing cursors")
                }
                Err(_) => tracing::error!(
                    events = batch.len(),
                    "inbox batch timed out; retrying same batch"
                ),
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }
}

async fn index_event(
    queue: Queue,
    state: Arc<Mutex<AppState>>,
    pool: Arc<rocksky_db::Backend>,
    nc: Arc<async_nats::Client>,
    job: Job,
) -> Result<(), Failure> {
    if queue.step(&job, "index.v1").await?.is_some() {
        return Ok(());
    }
    let message: Root = serde_json::from_str(&job.payload).map_err(|_| Failure {
        message: "invalid persisted Jetstream event".into(),
        permanent: true,
    })?;
    let commit = message.commit.ok_or_else(|| Failure {
        message: "missing Jetstream commit".into(),
        permanent: true,
    })?;
    let started = std::time::Instant::now();
    let span = tracing::info_span!("jetstream.commit", otel.kind = "consumer",
        submission.id = %job.id, jetstream.source = %job.source,
        jetstream.version = if job.source.starts_with("jetstream:v2:") { "v2" } else if job.source.starts_with("jetstream:v1:") { "v1" } else { "legacy" }, jetstream.did = %message.did,
        jetstream.collection = %commit.collection, jetstream.rkey = %commit.rkey);
    let result = save_scrobble(state, pool, nc, &message.did, commit)
        .instrument(span)
        .await;
    rocksky_telemetry::metrics::record_work(
        "jetstream.commit",
        if result.is_ok() { "ok" } else { "error" },
        started.elapsed().as_secs_f64(),
    );
    result?;
    queue.checkpoint(&job, "index.v1", "{}").await?;
    Ok(())
}

fn worker_capacity(total: usize, reserved: Option<usize>) -> anyhow::Result<(usize, usize)> {
    anyhow::ensure!(
        (2..=1024).contains(&total),
        "MAX_INFLIGHT_SCROBBLES must be 2..1024 to reserve capacity for both lanes"
    );
    let scrobbles = reserved.unwrap_or(total - (total / 4).max(1));
    anyhow::ensure!(
        scrobbles > 0 && scrobbles < total,
        "JETSTREAM_SCROBBLE_CONCURRENCY must be positive and smaller than MAX_INFLIGHT_SCROBBLES"
    );
    Ok((scrobbles, total - scrobbles))
}

fn initial_cursor() -> i64 {
    env::var("JETSTREAM_CURSOR")
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source::tests::commit_v2;

    #[test]
    fn priority_capacity_preserves_total_and_both_lanes() {
        assert_eq!(worker_capacity(64, None).unwrap(), (48, 16));
        assert_eq!(worker_capacity(64, Some(24)).unwrap(), (24, 40));
        assert_eq!(worker_capacity(2, None).unwrap(), (1, 1));
        for (total, reserved) in [(1, None), (1025, None), (64, Some(0)), (64, Some(64))] {
            assert!(worker_capacity(total, reserved).is_err());
        }
    }

    async fn durable_versions(queue: Queue) {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let kind = format!("test.jetstream.{unique}");
        let v1 = Source::new(Version::V1, &format!("wss://v1-{unique}.example"), 0).unwrap();
        let v2 = Source::new(Version::V2, &format!("wss://v2-{unique}.example"), 0).unwrap();
        let peer = Source::new(Version::V2, &format!("wss://peer-{unique}.example"), 0).unwrap();
        let Frame::Commit { event, cursor } = v2.decode(&commit_v2("create")).unwrap() else {
            panic!("commit expected")
        };
        let normalized = serde_json::to_string(&event).unwrap();
        let Frame::Commit {
            event: legacy,
            cursor: timestamp,
        } = v1.decode(&normalized).unwrap()
        else {
            panic!("commit expected")
        };
        let key = dedup_key(&event.did, event.commit.as_ref().unwrap());
        assert_eq!(key, dedup_key(&legacy.did, legacy.commit.as_ref().unwrap()));
        assert_eq!(queue.cursor(&v2.cursor_key()).await.unwrap(), None);
        queue
            .ingest_batch(
                &kind,
                &[
                    InboxEvent {
                        source: v2.cursor_key(),
                        cursor,
                        key: key.clone(),
                        payload: normalized.clone(),
                    },
                    InboxEvent {
                        source: v1.cursor_key(),
                        cursor: timestamp,
                        key: key.clone(),
                        payload: normalized.clone(),
                    },
                    InboxEvent {
                        source: peer.cursor_key(),
                        cursor: 7,
                        key: key.clone(),
                        payload: normalized.clone(),
                    },
                ],
            )
            .await
            .unwrap();
        assert_eq!(
            queue.cursor(&v1.cursor_key()).await.unwrap(),
            Some(timestamp)
        );
        assert_eq!(queue.cursor(&v2.cursor_key()).await.unwrap(), Some(42));
        assert_eq!(queue.cursor(&peer.cursor_key()).await.unwrap(), Some(7));
        // Inclusive replay does not replace the first source label or create work twice.
        queue
            .ingest(&kind, &v1.cursor_key(), timestamp, &key, &normalized)
            .await
            .unwrap();
        let job = queue.claim(&kind, 60, 3).await.unwrap().unwrap();
        assert_eq!(job.source, v2.cursor_key());
        let stored: Root = serde_json::from_str(&job.payload).unwrap();
        assert_eq!(stored.commit.unwrap().operation, "create");
        assert!(queue.claim(&kind, 60, 3).await.unwrap().is_none());
        queue.finish(&job).await.unwrap();
        assert!(v2
            .request(queue.cursor(&v2.cursor_key()).await.unwrap().unwrap())
            .unwrap()
            .uri()
            .to_string()
            .contains("cursor=42"));
    }

    #[tokio::test]
    async fn both_versions_share_one_durable_job_on_postgres() {
        let Ok(url) = env::var("ROCKSKY_TEST_POSTGRES_URL") else {
            eprintln!("set ROCKSKY_TEST_POSTGRES_URL to run PostgreSQL test");
            return;
        };
        durable_versions(Queue::connect(&url).await.unwrap()).await;
    }
    #[cfg(feature = "sqlite")]
    #[tokio::test]
    async fn both_versions_share_one_durable_job_on_sqlite() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = env::temp_dir().join(format!("rocksky-jetstream-{unique}"));
        std::fs::create_dir_all(&dir).unwrap();
        let url = format!("sqlite://{}?mode=rwc", dir.join("queue.db").display());
        durable_versions(Queue::connect(&url).await.unwrap()).await;
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
