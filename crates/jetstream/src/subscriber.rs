use crate::{
    repo::save_scrobble,
    types::{Commit, Root},
    webhook_worker::AppState,
};
use anyhow::Error;
use futures_util::StreamExt;
use owo_colors::OwoColorize;
use rocksky_submissions::queue::InboxEvent;
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

/// Slack subtracted from the watermark when building a reconnect cursor.
/// Jetstream cursors are unix microseconds; 5s ensures we don't miss events
/// emitted in the gap between our last `time_us` and the disconnect.
const RECONNECT_SLACK_US: i64 = 5_000_000;

/// Captures each source into a durable inbox before advancing its cursor.
/// Duplicate source events share a job; interrupted indexing is retried.
pub struct MultiSourceSubscriber {
    servers: Vec<String>,
}

impl MultiSourceSubscriber {
    pub fn new(servers: Vec<String>) -> Self {
        Self { servers }
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

        anyhow::ensure!(
            max_inflight > 0 && max_inflight <= 1024,
            "MAX_INFLIGHT_SCROBBLES must be 1..1024"
        );
        let queue = Queue::from_env().await?;
        let shutdown = CancellationToken::new();
        let mut tasks = tokio::task::JoinSet::new();
        let process_queue = queue.clone();
        tasks.spawn(worker::run(
            queue.clone(),
            INBOX_KIND,
            max_inflight,
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
    server: String,
    queue: Queue,
    inbox: mpsc::Sender<InboxEvent>,
) {
    // Independent checkpoints: the fastest source cannot move a lagging peer
    // past events it has not yet durably captured.
    let source = format!("jetstream:v1:{server}");
    loop {
        let cursor = match queue.cursor(&source).await {
            Ok(cursor) => cursor.unwrap_or(0),
            Err(error) => {
                tracing::error!(%error, "cannot load durable Jetstream cursor");
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
        };
        let url = build_subscribe_url(&server, cursor);
        tracing::info!(worker=idx, url=%url.bright_green(), "Connecting to jetstream");
        match tokio::time::timeout(Duration::from_secs(15), connect_async(&url)).await {
            Ok(Ok((mut stream, _))) => {
                loop {
                    let frame =
                        match tokio::time::timeout(Duration::from_secs(60), stream.next()).await {
                            Ok(Some(frame)) => frame,
                            Ok(None) => break,
                            Err(_) => {
                                tracing::warn!(
                                    worker = idx,
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
                    let message: Root = match serde_json::from_str(&text) {
                        Ok(message) => message,
                        Err(error) => {
                            tracing::error!(%error, "malformed Jetstream frame");
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
                    let Some(commit) = message.commit else {
                        continue;
                    };
                    let key = dedup_key(&message.did, &commit);
                    // This buffer is bounded and does NOT acknowledge a cursor.
                    // If the process dies, uncommitted events replay from the DB.
                    if inbox
                        .send(InboxEvent {
                            source: source.clone(),
                            cursor: message.time_us,
                            key,
                            payload: text.to_string(),
                        })
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
            }
            Ok(Err(error)) => tracing::error!(%error, worker=idx, "Jetstream connection failed"),
            Err(_) => tracing::warn!(worker = idx, "Jetstream connection timed out"),
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
        submission.id = %job.id, jetstream.did = %message.did,
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

fn build_subscribe_url(server: &str, watermark_us: i64) -> String {
    // A fresh process has no watermark and starts live. `JETSTREAM_CURSOR`
    // (unix microseconds) replays from a point in the past instead, which is
    // how commits consumed by a build that could not handle them get a second
    // pass after a deploy. Only the first connection uses it; reconnects
    // resume from the watermark as usual.
    let watermark_us = if watermark_us > 0 {
        watermark_us
    } else {
        initial_cursor()
    };
    let mut base = format!(
        "{}/subscribe?wantedCollections=app.rocksky.*",
        server.trim_end_matches('/')
    );
    for collection in EXTRA_COLLECTIONS {
        base.push_str("&wantedCollections=");
        base.push_str(collection);
    }
    if watermark_us > 0 {
        let cursor = watermark_us.saturating_sub(RECONNECT_SLACK_US).max(0);
        format!("{}&cursor={}", base, cursor)
    } else {
        base
    }
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

    #[test]
    fn the_subscription_asks_for_the_calendar_collections() {
        let url = build_subscribe_url("wss://jetstream.example/", 0);
        assert_eq!(
            url,
            "wss://jetstream.example/subscribe?wantedCollections=app.rocksky.*\
             &wantedCollections=community.lexicon.calendar.event\
             &wantedCollections=community.lexicon.calendar.rsvp"
        );
    }

    #[test]
    fn the_cursor_is_appended_with_slack() {
        let url = build_subscribe_url("wss://jetstream.example", 10_000_000);
        assert!(url.ends_with("&cursor=5000000"), "{url}");
    }
}
