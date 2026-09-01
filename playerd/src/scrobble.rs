//! Auto-scrobbling for whatever this daemon plays.
//!
//! Nothing is watching a headless player, so the scrobble decision can't live
//! in a UI the way it once did in the desktop app — it runs here, off the
//! engine snapshot, on its own tick. Same rule and same shape as
//! `desktop/src-tauri/src/session.rs`: half the track or 4 minutes, whichever
//! comes first.
//!
//! Metadata comes from the remote queue item when a controller enqueued the
//! track (it knows the album art and the real titles) and falls back to the
//! decoder's tags for local files.
//!
//! Off via `scrobble = false` in the TOML config; on by default.

use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rockbox_playback::PlaybackState;
use rocksky_sdk::{AppView, ScrobbleInput};

use crate::remote::Shared;

/// How often the scrobbler looks at the engine. Fast enough to land the
/// threshold on the right track, cheap enough to run forever — a tick only
/// reads the snapshot the engine thread already keeps.
const TICK: Duration = Duration::from_secs(1);

/// Last.fm's rule, and what the desktop app applies: half the track, capped at
/// 4 minutes.
const SCROBBLE_CAP_MS: u64 = 4 * 60 * 1000;

/// Back-off before retrying a scrobble the server rejected (offline, expired
/// token…), so a failing submit doesn't retry every tick.
const RETRY_AFTER: Duration = Duration::from_secs(30);

/// A position drop this large, landing near the start, means the track began
/// again (repeat-one, or the next entry being the same file) rather than a seek.
const REPLAY_EPSILON_MS: u64 = 5_000;

/// The current track, as much as the daemon knows about it.
struct Current {
    key: String,
    title: String,
    artist: String,
    album_artist: String,
    album: String,
    album_art: String,
    duration_ms: u64,
    position_ms: u64,
    track_number: Option<i32>,
}

fn current_track(shared: &Shared) -> Option<Current> {
    let status = shared.engine.snapshot().status;
    // A stopped engine has nothing in flight; forget the play rather than let
    // it resume later against a stale start time.
    if status.state == PlaybackState::Stopped {
        return None;
    }
    let index = status.index?;
    let meta = shared.queue_meta.lock().unwrap();
    let item = meta.get(index);
    let tags = status.metadata.as_ref();

    let pick = |from_item: Option<&str>, from_tags: Option<&str>| -> String {
        from_item
            .filter(|s| !s.is_empty())
            .or(from_tags.filter(|s| !s.is_empty()))
            .unwrap_or_default()
            .to_string()
    };

    let artist = pick(
        item.map(|i| i.artist.as_str()),
        tags.map(|m| m.artist.as_str()),
    );
    let album_artist = pick(
        item.map(|i| i.album_artist.as_str()),
        tags.map(|m| m.albumartist.as_str()),
    );
    Some(Current {
        // The queue position plus the title: a local file has no stable id, and
        // the position alone would miss a repeat of the same index.
        key: format!(
            "{index}\u{1}{}",
            pick(
                item.map(|i| i.title.as_str()),
                tags.map(|m| m.title.as_str()),
            )
        ),
        title: pick(
            item.map(|i| i.title.as_str()),
            tags.map(|m| m.title.as_str()),
        ),
        album: pick(
            item.map(|i| i.album.as_str()),
            tags.map(|m| m.album.as_str()),
        ),
        album_artist: if album_artist.is_empty() {
            artist.clone()
        } else {
            album_artist
        },
        artist,
        // Only a remote enqueue carries an art URL; file tags don't.
        album_art: item.map(|i| i.album_art.clone()).unwrap_or_default(),
        duration_ms: match status.duration.as_millis() as u64 {
            0 => item.map(|i| i.duration_ms).unwrap_or(0),
            d => d,
        },
        position_ms: status.position.as_millis() as u64,
        track_number: item.map(|i| i.track_number).filter(|n| *n > 0),
    })
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

/// Per-play bookkeeping. One instance lives in the loop.
#[derive(Default)]
struct Watcher {
    key: Option<String>,
    /// Wall clock when this play started — the scrobble's `timestamp`.
    started_at: i64,
    last_position_ms: u64,
    submitted: bool,
    retry_after: Option<Instant>,
}

impl Watcher {
    /// Track identity/replay bookkeeping. Returns true when this tick is the
    /// one that crosses the threshold.
    fn advance(&mut self, current: &Current) -> bool {
        let is_new = self.key.as_deref() != Some(current.key.as_str());
        // Repeat-one (and a queue whose next entry is the same file) keeps the
        // key but rewinds the clock: that is a new play, not a seek backwards.
        let replayed = !is_new
            && current.position_ms + REPLAY_EPSILON_MS < self.last_position_ms
            && current.position_ms < REPLAY_EPSILON_MS;
        if is_new || replayed {
            self.key = Some(current.key.clone());
            self.started_at = unix_now();
            self.last_position_ms = current.position_ms;
            self.submitted = false;
            self.retry_after = None;
            return false;
        }
        self.last_position_ms = current.position_ms;

        if self.submitted || current.duration_ms == 0 {
            return false;
        }
        if let Some(at) = self.retry_after {
            if Instant::now() < at {
                return false;
            }
        }
        current.position_ms >= (current.duration_ms / 2).min(SCROBBLE_CAP_MS)
    }
}

/// Run the scrobbler until the process exits.
pub async fn scrobble_loop(shared: Arc<Shared>, api_url: String, token: String) {
    let appview = AppView::new(api_url).with_token(token);
    let mut watcher = Watcher::default();
    loop {
        tokio::time::sleep(TICK).await;

        let Some(current) = current_track(&shared) else {
            watcher.key = None;
            continue;
        };
        if !watcher.advance(&current) {
            continue;
        }
        if current.title.is_empty() || current.artist.is_empty() {
            // Nothing identifies this track yet (tags still loading, or a bare
            // path we could not read) — don't post a nameless scrobble.
            continue;
        }

        let input = ScrobbleInput {
            title: current.title.clone(),
            artist: current.artist.clone(),
            album_artist: current.album_artist.clone(),
            album: Some(current.album.clone()).filter(|a| !a.is_empty()),
            duration: Some(current.duration_ms).filter(|d| *d > 0),
            album_art: Some(current.album_art.clone()).filter(|a| !a.is_empty()),
            timestamp: Some(watcher.started_at),
            track_number: current.track_number,
            ..Default::default()
        };
        match appview.create_scrobble(&input).await {
            Ok(_) => {
                watcher.submitted = true;
                tracing::info!(title = %input.title, artist = %input.artist, "scrobble submitted");
            }
            Err(e) => {
                watcher.retry_after = Some(Instant::now() + RETRY_AFTER);
                tracing::warn!(
                    "scrobble failed, retrying in {}s: {e}",
                    RETRY_AFTER.as_secs()
                );
            }
        }
    }
}
