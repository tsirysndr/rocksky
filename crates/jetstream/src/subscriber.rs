use std::{
    env,
    num::NonZeroUsize,
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc,
    },
    time::Duration,
};

use anyhow::{Context, Error};
use futures_util::{FutureExt, StreamExt};
use lru::LruCache;
use owo_colors::OwoColorize;
use sqlx::postgres::PgPoolOptions;
use std::panic::AssertUnwindSafe;
use tokio::sync::{mpsc, Mutex, Semaphore};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::{
    repo::save_scrobble,
    types::{Commit, Root},
    webhook_worker::AppState,
};

pub const SCROBBLE_NSID: &str = "app.rocksky.scrobble";
pub const ARTIST_NSID: &str = "app.rocksky.artist";
pub const ALBUM_NSID: &str = "app.rocksky.album";
pub const SONG_NSID: &str = "app.rocksky.song";
pub const PLAYLIST_NSID: &str = "app.rocksky.playlist";
pub const LIKE_NSID: &str = "app.rocksky.like";
pub const SHOUT_NSID: &str = "app.rocksky.shout";
pub const FEED_GENERATOR_NSID: &str = "app.rocksky.feed.generator";
pub const FOLLOW_NSID: &str = "app.rocksky.graph.follow";

/// Slack subtracted from the watermark when building a reconnect cursor.
/// Jetstream cursors are unix microseconds; 5s ensures we don't miss events
/// emitted in the gap between our last `time_us` and the disconnect.
const RECONNECT_SLACK_US: i64 = 5_000_000;

/// Subscribes to one or more Jetstream servers concurrently and deduplicates
/// the merged stream so a commit observed on multiple servers is only
/// processed once.
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

        let db_url = env::var("XATA_POSTGRES_URL")
            .context("Failed to get XATA_POSTGRES_URL environment variable")?;

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
        let dedup_capacity: usize = env::var("JETSTREAM_DEDUP_CAPACITY")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(50_000);

        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .min_connections(2)
            .acquire_timeout(Duration::from_secs(10))
            .max_lifetime(Some(Duration::from_secs(60 * 14)))
            .test_before_acquire(true)
            .connect(&db_url)
            .await?;
        let pool = Arc::new(pool);

        let addr = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
        let nc = Arc::new(async_nats::connect(&addr).await?);

        let semaphore = Arc::new(Semaphore::new(max_inflight));

        // Global watermark — highest `time_us` observed across all sources.
        // Used as the reconnect cursor (minus slack) for every worker, so a
        // server that drifts or drops resumes near where the fastest peer is.
        let watermark = Arc::new(AtomicI64::new(0));

        // Bounded channel: backpressure flows back to the WS read loops if
        // the consumer falls behind, instead of unbounded memory growth.
        let (tx, mut rx) = mpsc::channel::<String>(1024);

        for (idx, server) in self.servers.iter().enumerate() {
            let server = server.clone();
            let tx = tx.clone();
            let watermark = watermark.clone();
            tokio::spawn(async move {
                run_connection_worker(idx, server, tx, watermark).await;
            });
        }
        // Drop our own sender so the consumer loop exits if every worker dies.
        drop(tx);

        let dedup_cap = NonZeroUsize::new(dedup_capacity.max(1)).unwrap();
        let mut dedup: LruCache<String, ()> = LruCache::new(dedup_cap);

        while let Some(text) = rx.recv().await {
            let message: Root = match serde_json::from_str(&text) {
                Ok(m) => m,
                Err(e) => {
                    tracing::error!(error = %e, raw = %text, "Failed to parse jetstream frame");
                    continue;
                }
            };

            // Advance the global watermark monotonically.
            if message.time_us > 0 {
                let mut cur = watermark.load(Ordering::Relaxed);
                while message.time_us > cur {
                    match watermark.compare_exchange_weak(
                        cur,
                        message.time_us,
                        Ordering::Relaxed,
                        Ordering::Relaxed,
                    ) {
                        Ok(_) => break,
                        Err(observed) => cur = observed,
                    }
                }
            }

            if message.kind != "commit" {
                continue;
            }
            let Some(commit) = message.commit else {
                continue;
            };

            let key = dedup_key(&message.did, &commit);
            if dedup.put(key.clone(), ()).is_some() {
                tracing::debug!(dedup_key = %key, "Dropping duplicate jetstream event");
                continue;
            }

            tracing::info!(message = %text, "Received message");

            let permit = match semaphore.clone().acquire_owned().await {
                Ok(p) => p,
                Err(e) => {
                    tracing::error!(error = %e, "Semaphore closed; exiting read loop");
                    break;
                }
            };

            spawn_handler(
                state.clone(),
                pool.clone(),
                nc.clone(),
                permit,
                message.did,
                commit,
            );
        }

        Ok(())
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
    tx: mpsc::Sender<String>,
    watermark: Arc<AtomicI64>,
) {
    loop {
        let cursor = watermark.load(Ordering::Relaxed);
        let url = build_subscribe_url(&server, cursor);
        tracing::info!(worker = idx, url = %url.bright_green(), "Connecting to jetstream");

        match connect_async(&url).await {
            Ok((mut ws_stream, _)) => {
                tracing::info!(worker = idx, url = %server.bright_green(), "Connected to jetstream");
                while let Some(msg) = ws_stream.next().await {
                    match msg {
                        Ok(Message::Text(text)) => {
                            if tx.send(text.to_string()).await.is_err() {
                                tracing::warn!(worker = idx, "Consumer dropped; worker exiting");
                                return;
                            }
                        }
                        Ok(Message::Close(_)) => {
                            tracing::warn!(worker = idx, "Jetstream sent Close frame");
                            break;
                        }
                        Ok(_) => continue,
                        Err(e) => {
                            tracing::error!(worker = idx, error = %e, "WebSocket error");
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::error!(
                    worker = idx,
                    error = %e,
                    "Failed to connect to jetstream, retrying in 1s"
                );
            }
        }

        tracing::warn!(
            worker = idx,
            "Disconnected from jetstream, reconnecting in 1s"
        );
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

fn build_subscribe_url(server: &str, watermark_us: i64) -> String {
    let base = format!(
        "{}/subscribe?wantedCollections=app.rocksky.*",
        server.trim_end_matches('/')
    );
    if watermark_us > 0 {
        let cursor = watermark_us.saturating_sub(RECONNECT_SLACK_US).max(0);
        format!("{}&cursor={}", base, cursor)
    } else {
        base
    }
}

fn spawn_handler(
    state: Arc<Mutex<AppState>>,
    pool: Arc<sqlx::PgPool>,
    nc: Arc<async_nats::Client>,
    permit: tokio::sync::OwnedSemaphorePermit,
    did: String,
    commit: Commit,
) {
    tokio::spawn(async move {
        let _permit = permit;
        let collection = commit.collection.clone();
        let rkey = commit.rkey.clone();
        // Wrap in catch_unwind so a panic inside save_scrobble (e.g.
        // an out-of-bounds index on a post-INSERT SELECT) is logged
        // instead of silently aborting the spawned task and losing
        // the scrobble + Discord notification.
        let outcome = AssertUnwindSafe(save_scrobble(state, pool, nc, &did, commit))
            .catch_unwind()
            .await;
        match outcome {
            Ok(Ok(_)) => {
                tracing::info!(user_id = %did.bright_green(), %collection, %rkey, "Scrobble saved successfully");
            }
            Ok(Err(e)) => {
                tracing::error!(error = %e, %collection, %rkey, %did, "Error saving scrobble");
            }
            Err(panic) => {
                let msg = panic
                    .downcast_ref::<String>()
                    .cloned()
                    .or_else(|| panic.downcast_ref::<&str>().map(|s| s.to_string()))
                    .unwrap_or_else(|| "<non-string panic>".to_string());
                tracing::error!(
                    panic = %msg,
                    %collection,
                    %rkey,
                    %did,
                    "save_scrobble PANICKED — scrobble lost"
                );
            }
        }
    });
}
