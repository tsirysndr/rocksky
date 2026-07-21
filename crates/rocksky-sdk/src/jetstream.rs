//! Keep the [`crate::dedup::RepoIndex`] continuously hydrated from the Bluesky
//! [Jetstream](https://github.com/bluesky-social/jetstream) firehose.
//!
//! Jetstream is the JSON view of the relay firehose. We subscribe to all four
//! public servers **at once**, filtered server-side to `app.rocksky.*` for the
//! user's DID, and apply every commit to the index as it arrives. A shared
//! watermark (the highest `time_us` seen across sources) de-duplicates the
//! overlap between servers and doubles as the reconnect cursor, so a single
//! server stalling or dropping never opens a gap.
//!
//! Gated behind the `jetstream` feature (implies `dedup`).

use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures::StreamExt;
use serde::Deserialize;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use crate::dedup::RepoIndex;
use crate::error::Result;

/// The four public Jetstream servers (two per US coast).
pub const DEFAULT_SERVERS: [&str; 4] = [
    "wss://jetstream1.us-east.bsky.network",
    "wss://jetstream2.us-east.bsky.network",
    "wss://jetstream1.us-west.bsky.network",
    "wss://jetstream2.us-west.bsky.network",
];

/// Subtracted from the watermark when building a reconnect cursor so we re-read a
/// few seconds of overlap rather than risk skipping an event. Jetstream cursors
/// are Unix microseconds.
const RECONNECT_SLACK_US: i64 = 5_000_000;

/// Configuration for [`run`].
#[derive(Clone, Debug)]
pub struct JetstreamConfig {
    /// Servers to connect to simultaneously. Defaults to [`DEFAULT_SERVERS`].
    pub servers: Vec<String>,
    /// The `wantedCollections` filter. Defaults to `app.rocksky.*`.
    pub wanted_collections: String,
    /// Reconnect backoff.
    pub reconnect_delay: Duration,
}

impl Default for JetstreamConfig {
    fn default() -> Self {
        Self {
            servers: DEFAULT_SERVERS.iter().map(|s| s.to_string()).collect(),
            wanted_collections: "app.rocksky.*".to_string(),
            reconnect_delay: Duration::from_secs(2),
        }
    }
}

impl JetstreamConfig {
    /// A config with a custom set of Jetstream servers, overriding
    /// [`DEFAULT_SERVERS`]. Accepts full `wss://…` URLs or bare hosts. All other
    /// fields keep their defaults.
    ///
    /// ```
    /// # use rocksky_sdk::JetstreamConfig;
    /// let cfg = JetstreamConfig::with_servers([
    ///     "wss://my-jetstream.example.com",
    ///     "wss://jetstream1.us-west.bsky.network",
    /// ]);
    /// # let _ = cfg;
    /// ```
    pub fn with_servers<I, S>(servers: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            servers: servers.into_iter().map(Into::into).collect(),
            ..Self::default()
        }
    }

    /// Replace the server list (builder-style).
    pub fn servers<I, S>(mut self, servers: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.servers = servers.into_iter().map(Into::into).collect();
        self
    }

    /// Override the `wantedCollections` filter (default `app.rocksky.*`).
    pub fn wanted_collections(mut self, filter: impl Into<String>) -> Self {
        self.wanted_collections = filter.into();
        self
    }

    /// Override the reconnect backoff.
    pub fn reconnect_delay(mut self, delay: Duration) -> Self {
        self.reconnect_delay = delay;
        self
    }
}

/// Hydrate `index` from Jetstream for `did`, connecting to every configured
/// server concurrently. Runs until the returned future is dropped/cancelled;
/// each source reconnects with backoff on failure. Resumes from the index's
/// persisted cursor.
pub async fn run(index: Arc<RepoIndex>, did: String, config: JetstreamConfig) -> Result<()> {
    let start = index.cursor(&did)?.unwrap_or(0);
    let watermark = Arc::new(AtomicI64::new(start));
    tracing::info!(%did, servers = config.servers.len(), start_cursor = start, "jetstream hydration starting");

    let mut tasks = Vec::new();
    for server in config.servers {
        let index = index.clone();
        let did = did.clone();
        let watermark = watermark.clone();
        let collections = config.wanted_collections.clone();
        let delay = config.reconnect_delay;
        tasks.push(tokio::spawn(async move {
            source_loop(server, collections, index, did, watermark, delay).await
        }));
    }

    // The sources run forever; awaiting them keeps the task alive and surfaces a
    // panic if one occurs.
    for task in tasks {
        let _ = task.await;
    }
    Ok(())
}

/// One server's connect→read→reconnect loop.
async fn source_loop(
    server: String,
    collections: String,
    index: Arc<RepoIndex>,
    did: String,
    watermark: Arc<AtomicI64>,
    reconnect_delay: Duration,
) {
    loop {
        let cursor = (watermark.load(Ordering::Relaxed) - RECONNECT_SLACK_US).max(0);
        let url = build_subscribe_url(&server, &collections, &did, cursor);

        match connect_async(&url).await {
            Ok((mut ws, _)) => {
                tracing::info!(%server, cursor, "jetstream connected");
                while let Some(msg) = ws.next().await {
                    match msg {
                        Ok(Message::Text(text)) => {
                            if let Err(e) = handle_event(text.as_str(), &index, &did, &watermark) {
                                tracing::warn!(%server, error = %e, "failed to apply jetstream event");
                            }
                        }
                        Ok(Message::Close(frame)) => {
                            tracing::info!(%server, ?frame, "jetstream closed by server");
                            break;
                        }
                        Ok(_) => {} // ping/pong/binary — ignore
                        Err(e) => {
                            tracing::warn!(%server, error = %e, "jetstream read error");
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!(%server, error = %e, "jetstream connect failed");
            }
        }

        tokio::time::sleep(reconnect_delay).await;
    }
}

/// Parse one event and, if it advances the shared watermark, apply it. Events at
/// or below the watermark were already handled by another source and are skipped.
fn handle_event(text: &str, index: &RepoIndex, did: &str, watermark: &AtomicI64) -> Result<()> {
    let event: Event = match serde_json::from_str(text) {
        Ok(e) => e,
        Err(e) => {
            tracing::debug!(error = %e, "skipping unparsable jetstream frame");
            return Ok(());
        }
    };
    if event.kind != "commit" || event.did != did {
        return Ok(());
    }
    let Some(commit) = event.commit else {
        return Ok(());
    };

    // Claim this event for exactly one source by advancing the watermark.
    loop {
        let cur = watermark.load(Ordering::Relaxed);
        if event.time_us <= cur {
            return Ok(()); // already processed by another server
        }
        if watermark
            .compare_exchange_weak(cur, event.time_us, Ordering::AcqRel, Ordering::Relaxed)
            .is_ok()
        {
            break;
        }
    }

    index.apply_commit(
        &event.did,
        &commit.collection,
        &commit.operation,
        &commit.rkey,
        commit.record.as_ref(),
    )?;
    index.set_cursor(did, event.time_us)?;
    tracing::trace!(collection = %commit.collection, op = %commit.operation, "indexed jetstream event");
    Ok(())
}

fn build_subscribe_url(server: &str, collections: &str, did: &str, cursor_us: i64) -> String {
    let enc = |s: &str| s.replace(':', "%3A").replace('*', "%2A");
    let base = format!(
        "{}/subscribe?wantedCollections={}&wantedDids={}",
        server.trim_end_matches('/'),
        enc(collections),
        enc(did),
    );
    if cursor_us > 0 {
        format!("{base}&cursor={cursor_us}")
    } else {
        base
    }
}

// ---- Jetstream JSON event model (subset we consume) ----------------------

#[derive(Debug, Deserialize)]
struct Event {
    did: String,
    time_us: i64,
    kind: String,
    #[serde(default)]
    commit: Option<Commit>,
}

#[derive(Debug, Deserialize)]
struct Commit {
    operation: String,
    collection: String,
    rkey: String,
    #[serde(default)]
    record: Option<serde_json::Value>,
}
