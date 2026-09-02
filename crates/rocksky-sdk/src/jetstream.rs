//! Multi-server [Jetstream](https://github.com/bluesky-social/jetstream)
//! firehose watcher.
//!
//! Jetstream is the JSON view of the relay firehose. We subscribe to all four
//! public servers **at once**, filtered server-side to the wanted collections
//! for one DID, and deliver every commit as it arrives. A shared watermark
//! (the highest `time_us` seen across sources) de-duplicates the overlap
//! between servers and doubles as the reconnect cursor, so a single server
//! stalling or dropping never opens a gap.
//!
//! [`watch`] is the generic form: every commit reaches a callback
//! (`jetstream-core` feature). [`run`] layers the [`crate::dedup::RepoIndex`]
//! hydration on top of it (`jetstream` feature, implies `dedup`).

use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures::StreamExt;
use serde::Deserialize;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

#[cfg(feature = "jetstream")]
use crate::dedup::RepoIndex;
#[cfg(feature = "jetstream")]
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

/// How many recent commit identities to remember for cross-server dedup.
/// `time_us` is stamped per Jetstream server, so the watermark alone lets the
/// same commit through once per server when they arrive in ascending order —
/// the identity set is what actually collapses the overlap.
const SEEN_CAPACITY: usize = 256;

/// Recently delivered commit identities (`rev/collection/rkey/operation`),
/// shared by every source.
struct SeenCommits {
    order: VecDeque<String>,
    set: HashSet<String>,
}

impl SeenCommits {
    fn new() -> Self {
        SeenCommits {
            order: VecDeque::with_capacity(SEEN_CAPACITY),
            set: HashSet::with_capacity(SEEN_CAPACITY),
        }
    }

    /// True the first time `key` is inserted; false for a duplicate.
    fn insert(&mut self, key: String) -> bool {
        if self.set.contains(&key) {
            return false;
        }
        if self.order.len() == SEEN_CAPACITY {
            if let Some(evicted) = self.order.pop_front() {
                self.set.remove(&evicted);
            }
        }
        self.order.push_back(key.clone());
        self.set.insert(key);
        true
    }
}

/// Configuration for [`watch`] / [`run`].
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

/// One repo commit from the firehose, already de-duplicated across servers.
#[derive(Debug, Clone)]
pub struct WatchEvent {
    pub collection: String,
    /// `create`, `update`, or `delete`.
    pub operation: String,
    pub rkey: String,
    /// The record for creates/updates; `None` for deletes.
    pub record: Option<serde_json::Value>,
    /// Jetstream event time (Unix microseconds).
    pub time_us: i64,
}

/// Watch `did`'s commits, connecting to every configured server concurrently,
/// and invoke `on_event` for each commit exactly once (the shared watermark
/// claims each event for one source). Starts at the live tail. Runs until the
/// returned future is dropped/cancelled; each source reconnects with backoff.
pub async fn watch<F>(did: String, config: JetstreamConfig, on_event: F)
where
    F: Fn(WatchEvent) + Send + Sync + 'static,
{
    watch_from(did, config, 0, on_event).await
}

/// [`watch`], but resuming from `cursor_us` (0 = live tail).
pub async fn watch_from<F>(did: String, config: JetstreamConfig, cursor_us: i64, on_event: F)
where
    F: Fn(WatchEvent) + Send + Sync + 'static,
{
    let watermark = Arc::new(AtomicI64::new(cursor_us));
    let seen = Arc::new(Mutex::new(SeenCommits::new()));
    let on_event: Arc<dyn Fn(WatchEvent) + Send + Sync> = Arc::new(on_event);
    tracing::info!(
        %did,
        servers = config.servers.len(),
        collections = %config.wanted_collections,
        start_cursor = cursor_us,
        "jetstream watch starting"
    );

    let mut tasks = Vec::new();
    for server in config.servers {
        let did = did.clone();
        let watermark = watermark.clone();
        let seen = seen.clone();
        let collections = config.wanted_collections.clone();
        let delay = config.reconnect_delay;
        let on_event = on_event.clone();
        tasks.push(tokio::spawn(async move {
            source_loop(server, collections, did, watermark, seen, delay, on_event).await
        }));
    }

    // The sources run forever; awaiting them keeps the task alive and surfaces a
    // panic if one occurs.
    for task in tasks {
        let _ = task.await;
    }
}

/// One server's connect→read→reconnect loop.
async fn source_loop(
    server: String,
    collections: String,
    did: String,
    watermark: Arc<AtomicI64>,
    seen: Arc<Mutex<SeenCommits>>,
    reconnect_delay: Duration,
    on_event: Arc<dyn Fn(WatchEvent) + Send + Sync>,
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
                            handle_event(text.as_str(), &did, &watermark, &seen, &on_event)
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

/// Parse one event, advance the shared watermark (the reconnect cursor), and
/// deliver it once across all sources. `time_us` is stamped per server, so the
/// watermark alone cannot collapse the cross-server overlap — the commit's
/// identity (`rev`, unique per repo write) is what claims it for one source.
fn handle_event(
    text: &str,
    did: &str,
    watermark: &AtomicI64,
    seen: &Mutex<SeenCommits>,
    on_event: &Arc<dyn Fn(WatchEvent) + Send + Sync>,
) {
    let event: Event = match serde_json::from_str(text) {
        Ok(e) => e,
        Err(e) => {
            tracing::debug!(error = %e, "skipping unparsable jetstream frame");
            return;
        }
    };
    if event.kind != "commit" || event.did != did {
        return;
    }
    let Some(commit) = event.commit else {
        return;
    };

    // Advance the watermark so reconnect cursors track the newest event, but
    // never gate delivery on it: a server whose clock stamps behind another's
    // would silently drop events it was the only one to deliver.
    let mut cur = watermark.load(Ordering::Relaxed);
    while event.time_us > cur {
        match watermark.compare_exchange_weak(
            cur,
            event.time_us,
            Ordering::AcqRel,
            Ordering::Relaxed,
        ) {
            Ok(_) => break,
            Err(now) => cur = now,
        }
    }

    let key = format!(
        "{}/{}/{}/{}",
        commit.rev.as_deref().unwrap_or(""),
        commit.collection,
        commit.rkey,
        commit.operation,
    );
    if !seen.lock().unwrap().insert(key) {
        return; // already delivered by another server
    }

    tracing::trace!(collection = %commit.collection, op = %commit.operation, "jetstream event");
    on_event(WatchEvent {
        collection: commit.collection,
        operation: commit.operation,
        rkey: commit.rkey,
        record: commit.record,
        time_us: event.time_us,
    });
}

/// Hydrate `index` from Jetstream for `did`, connecting to every configured
/// server concurrently. Runs until the returned future is dropped/cancelled;
/// each source reconnects with backoff on failure. Resumes from the index's
/// persisted cursor.
#[cfg(feature = "jetstream")]
pub async fn run(index: Arc<RepoIndex>, did: String, config: JetstreamConfig) -> Result<()> {
    let start = index.cursor(&did)?.unwrap_or(0);
    let event_did = did.clone();
    watch_from(did, config, start, move |ev: WatchEvent| {
        let applied = index
            .apply_commit(
                &event_did,
                &ev.collection,
                &ev.operation,
                &ev.rkey,
                ev.record.as_ref(),
            )
            .and_then(|_| index.set_cursor(&event_did, ev.time_us));
        if let Err(e) = applied {
            tracing::warn!(error = %e, "failed to apply jetstream event");
        }
    })
    .await;
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
    /// The repo revision of this write — identical across every Jetstream
    /// server for the same commit, unlike `time_us`.
    #[serde(default)]
    rev: Option<String>,
    #[serde(default)]
    record: Option<serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seen_commits_dedupes_and_evicts() {
        let mut seen = SeenCommits::new();
        assert!(seen.insert("a".into()));
        assert!(!seen.insert("a".into()));
        for i in 0..SEEN_CAPACITY {
            seen.insert(format!("k{i}"));
        }
        // "a" was evicted by capacity, so it is deliverable again.
        assert!(seen.insert("a".into()));
    }

    /// The same commit arriving from several servers, each stamping its own
    /// `time_us`, must be delivered exactly once.
    #[test]
    fn cross_server_duplicate_is_delivered_once() {
        use std::sync::atomic::AtomicUsize;

        let watermark = AtomicI64::new(0);
        let seen = Mutex::new(SeenCommits::new());
        let delivered = Arc::new(AtomicUsize::new(0));
        let counter = delivered.clone();
        let on_event: Arc<dyn Fn(WatchEvent) + Send + Sync> = Arc::new(move |_| {
            counter.fetch_add(1, Ordering::SeqCst);
        });

        let frame = |time_us: i64| {
            format!(
                r#"{{"did":"did:plc:me","time_us":{time_us},"kind":"commit","commit":{{"operation":"update","collection":"app.rocksky.rockbox.audio.settings","rkey":"self","rev":"3abc","record":{{}}}}}}"#
            )
        };
        for time_us in [100, 130, 90, 210] {
            handle_event(&frame(time_us), "did:plc:me", &watermark, &seen, &on_event);
        }
        assert_eq!(delivered.load(Ordering::SeqCst), 1);
        // Watermark still tracks the newest stamp for reconnect cursors.
        assert_eq!(watermark.load(Ordering::Relaxed), 210);

        // A genuinely new commit (new rev) with an older per-server stamp
        // still gets through.
        let older_new = r#"{"did":"did:plc:me","time_us":50,"kind":"commit","commit":{"operation":"update","collection":"app.rocksky.rockbox.audio.settings","rkey":"self","rev":"3abd","record":{}}}"#;
        handle_event(older_new, "did:plc:me", &watermark, &seen, &on_event);
        assert_eq!(delivered.load(Ordering::SeqCst), 2);
    }
}
