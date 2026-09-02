//! Native now-playing session: OS media controls + scrobbling, driven off the
//! playback engine instead of the webview.
//!
//! Both used to be the webview's job — the sticky player pushed OS metadata
//! through `media_set_now_playing` and decided scrobbles in `useUploadScrobble`,
//! each fed by a `setInterval` that polls `player_status`. WKWebView and
//! WebView2 throttle timers for a window that is minimized or occluded (down to
//! one wake a minute, and eventually none at all), so with the app in the
//! background that poll stops: elapsed time never advances, Now Playing keeps
//! showing whatever was on screen when the window went away, and whole tracks
//! cross the scrobble threshold with nobody watching. This loop runs on the
//! Tokio runtime, which nothing throttles.
//!
//! The webview stays the source of truth whenever *it* owns playback: Spotify
//! and remote devices are invisible to the local engine, so deriving the OS
//! session from the engine would describe the wrong player. `session_set_source`
//! mirrors the frontend's `player` atom and we stand down for those.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rockbox_playback::PlaybackState;
use rocksky_sdk::{AppView, ScrobbleInput};
use serde::Deserialize;
use tauri::{AppHandle, Manager, State};

use crate::media::{self, NowPlaying};
use crate::remote::DEFAULT_API_URL;
use crate::state::AppState;

/// Session refresh period. Fast enough for a smooth Now Playing scrubber and
/// for the scrobble threshold to land on the right track, cheap enough to run
/// forever — a tick only reads the snapshot the engine thread already keeps.
const TICK: Duration = Duration::from_secs(1);

/// Scrobble at half the track or 4 minutes, whichever comes first — the
/// Last.fm rule, and what the webview applied before this moved native.
const SCROBBLE_CAP_MS: u64 = 4 * 60 * 1000;

/// Back-off before retrying a scrobble the server rejected (offline, expired
/// token…), so a failing submit doesn't retry every tick.
const RETRY_AFTER: Duration = Duration::from_secs(30);

/// A position drop this large, landing near the start, means the track began
/// again (repeat-one, or the next entry being the same file) rather than a seek.
const REPLAY_EPSILON_MS: u64 = 5_000;

/// Cap on the metadata registry so a huge "play all" can't grow it without
/// bound. Old entries are dropped wholesale; the engine queue is what matters
/// and the frontend re-registers whatever it enqueues.
const MAX_TRACKS: usize = 4096;

/// A queue entry as the webview knows it — everything a scrobble needs, which
/// tags on disk (and the remote protocol's queue items) don't carry.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TrackMeta {
    /// The exact URL/path this track is enqueued as.
    pub url: String,
    pub upload_id: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album: String,
    pub album_art: String,
    /// Track length in milliseconds.
    pub duration: u64,
    pub track_number: Option<i32>,
    pub copyright_message: Option<String>,
    pub genres: Option<Vec<String>>,
    pub release_date: Option<String>,
    pub year: Option<i32>,
}

/// What the native session needs from the webview: credentials, which player
/// owns playback, and metadata for the tracks it enqueued.
#[derive(Default)]
pub struct Session {
    token: Mutex<Option<String>>,
    api_url: Mutex<Option<String>>,
    /// The frontend `player` atom, verbatim.
    source: Mutex<Option<String>>,
    tracks: Mutex<HashMap<String, TrackMeta>>,
}

impl Session {
    /// Does the local engine own playback? Only Spotify and remote devices are
    /// somebody else's; an unset source means the webview hasn't spoken yet, and
    /// then the engine is the only thing that can be making sound anyway.
    fn engine_owns_playback(&self) -> bool {
        !matches!(
            self.source.lock().unwrap().as_deref(),
            Some("spotify") | Some("device")
        )
    }

    fn token(&self) -> Option<String> {
        self.token
            .lock()
            .unwrap()
            .clone()
            .filter(|t| !t.trim().is_empty())
    }

    fn api_url(&self) -> String {
        self.api_url
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_else(|| DEFAULT_API_URL.to_string())
    }

    /// Metadata for a queue URL, by exact URL first and then by the stable id
    /// embedded in it — stream URLs carry a rotating `?token=`, so the URL the
    /// engine holds can outlive the one we registered.
    pub(crate) fn lookup(&self, url: &str) -> Option<TrackMeta> {
        let tracks = self.tracks.lock().unwrap();
        if let Some(t) = tracks.get(url) {
            return Some(t.clone());
        }
        track_id_from_url(url).and_then(|id| tracks.get(&id).cloned())
    }

    fn register(&self, items: Vec<TrackMeta>) {
        let mut tracks = self.tracks.lock().unwrap();
        if tracks.len() + items.len() > MAX_TRACKS {
            tracks.clear();
        }
        for item in items {
            if !item.upload_id.is_empty() {
                tracks.insert(item.upload_id.clone(), item.clone());
            }
            if let Some(id) = track_id_from_url(&item.url) {
                tracks.insert(id, item.clone());
            }
            if !item.url.is_empty() {
                tracks.insert(item.url.clone(), item);
            }
        }
    }
}

/// The stable track id inside a stream URL: the uploadId in an uploads path, or
/// the `id` query param Navidrome/Subsonic streams carry. Mirrors
/// `uploadIdFromUrl` in src/lib/audio/rockbox-engine.ts.
fn track_id_from_url(url: &str) -> Option<String> {
    if let Some(after) = url.split("/uploads/").nth(1) {
        if let Some(id) = after.split('/').next() {
            if !id.is_empty() {
                return Some(id.to_string());
            }
        }
    }
    let query = url.split_once('?')?.1;
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == "id" && !v.is_empty()).then(|| v.to_string())
    })
}

/// Publish the session token (and the API base URL the webview is configured
/// with). `None` on sign-out — the session then only drives the OS controls.
#[tauri::command]
pub fn session_set_token(
    state: State<'_, AppState>,
    token: Option<String>,
    api_url: Option<String>,
) {
    *state.session.token.lock().unwrap() = token.filter(|t| !t.trim().is_empty());
    if let Some(url) = api_url {
        let url = url.trim_end_matches('/').to_string();
        if !url.is_empty() {
            *state.session.api_url.lock().unwrap() = Some(url);
        }
    }
}

/// Mirror the frontend's `player` atom so the native session knows whether the
/// local engine or the webview owns playback.
#[tauri::command]
pub fn session_set_source(state: State<'_, AppState>, source: Option<String>) {
    *state.session.source.lock().unwrap() = source;
}

/// Register queue metadata for tracks the webview enqueued. Additive: the
/// registry is keyed by URL/id, never by queue position.
#[tauri::command]
pub fn session_register_tracks(state: State<'_, AppState>, tracks: Vec<TrackMeta>) {
    state.session.register(tracks);
}

/// The current track, merged from the richest source available: the webview's
/// registry, then the remote-protocol queue mirror, then the decoder's tags.
struct Current {
    key: String,
    title: String,
    artist: String,
    album_artist: String,
    album: String,
    album_art: String,
    duration_ms: u64,
    position_ms: u64,
    is_playing: bool,
    track_number: Option<i32>,
    copyright_message: Option<String>,
    genres: Option<Vec<String>>,
    release_date: Option<String>,
    year: Option<i32>,
}

fn first_non_empty(candidates: [&str; 3]) -> String {
    candidates
        .into_iter()
        .find(|s| !s.is_empty())
        .unwrap_or_default()
        .to_string()
}

fn current_track(state: &AppState) -> Option<Current> {
    let snap = state.engine.snapshot();
    let index = snap.status.index?;
    let url = snap.queue.get(index)?.clone();

    let meta = state.session.lookup(&url).unwrap_or_default();
    // The enqueue registry covers tracks a controller enqueued, which never
    // went through the webview's registry. Keyed by the URL the engine holds,
    // so queue edits can never point the scrobbler at a neighbouring track.
    let queued = state.queue_items.lock().unwrap().get(&url).cloned();
    let (q_title, q_artist, q_album, q_album_artist, q_album_art, q_track_number) = queued
        .map(|q| {
            (
                q.title,
                q.artist,
                q.album,
                q.album_artist,
                q.album_art,
                q.track_number,
            )
        })
        .unwrap_or_default();
    let tags = snap.status.metadata;
    let (t_title, t_artist, t_album, t_album_artist) = tags
        .map(|m| (m.title, m.artist, m.album, m.albumartist))
        .unwrap_or_default();

    let artist = first_non_empty([&meta.artist, &q_artist, &t_artist]);
    let album_artist = first_non_empty([&meta.album_artist, &q_album_artist, &t_album_artist]);
    Some(Current {
        key: url,
        title: first_non_empty([&meta.title, &q_title, &t_title]),
        album: first_non_empty([&meta.album, &q_album, &t_album]),
        album_artist: if album_artist.is_empty() {
            artist.clone()
        } else {
            album_artist
        },
        artist,
        album_art: first_non_empty([&meta.album_art, &q_album_art, ""]),
        // The engine's duration comes from the decoder and is authoritative
        // once the track opens; before that it is zero.
        duration_ms: match snap.status.duration.as_millis() as u64 {
            0 => meta.duration,
            d => d,
        },
        position_ms: snap.status.position.as_millis() as u64,
        is_playing: snap.status.state == PlaybackState::Playing,
        track_number: meta
            .track_number
            .or(Some(q_track_number))
            .filter(|n| *n > 0),
        copyright_message: meta.copyright_message.filter(|s| !s.is_empty()),
        genres: meta.genres.filter(|g| !g.is_empty()),
        release_date: meta.release_date.filter(|s| !s.is_empty()),
        year: meta.year.filter(|y| *y > 0),
    })
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

/// Per-play scrobble bookkeeping. One instance lives in the session loop.
#[derive(Default)]
struct Watcher {
    /// Queue URL of the track being timed.
    key: Option<String>,
    /// Wall clock when this play started — the scrobble's `timestamp`.
    started_at: i64,
    last_position_ms: u64,
    submitted: bool,
    retry_after: Option<Instant>,
    /// Whether the OS controls currently show anything, so a stopped, empty
    /// engine doesn't hop onto the main thread every second.
    published: bool,
}

impl Watcher {
    /// Start timing a new play of `key`.
    fn restart(&mut self, key: String, position_ms: u64) {
        self.key = Some(key);
        self.started_at = unix_now();
        self.last_position_ms = position_ms;
        self.submitted = false;
        self.retry_after = None;
    }

    /// Track identity/replay bookkeeping. Returns the scrobble to submit, if
    /// this tick is the one that crosses the threshold.
    fn advance(&mut self, current: &Current) -> bool {
        let is_new = self.key.as_deref() != Some(current.key.as_str());
        // Repeat-one (and a queue whose next entry is the same file) keeps the
        // URL but rewinds the clock: that is a new play, not a seek backwards.
        let replayed = !is_new
            && current.position_ms + REPLAY_EPSILON_MS < self.last_position_ms
            && current.position_ms < REPLAY_EPSILON_MS;
        if is_new || replayed {
            self.restart(current.key.clone(), current.position_ms);
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
        let threshold = (current.duration_ms / 2).min(SCROBBLE_CAP_MS);
        current.position_ms >= threshold
    }
}

/// Start the native session loop. Runs for the life of the app.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut watcher = Watcher::default();
        loop {
            tokio::time::sleep(TICK).await;
            tick(&app, &mut watcher).await;
        }
    });
}

async fn tick(app: &AppHandle, watcher: &mut Watcher) {
    // Everything the tick needs is read up front: `State` borrows the app and
    // the queue locks are not held across the submit await.
    let (current, submit) = {
        let state = app.state::<AppState>();
        if !state.session.engine_owns_playback() {
            // Another source is playing — the webview publishes it and owns any
            // scrobbling for it. Forget the local track so resuming it later
            // starts a fresh play instead of scrobbling a stale timestamp.
            watcher.key = None;
            return;
        }
        let Some(current) = current_track(&state) else {
            if watcher.published {
                watcher.published = false;
                media::publish(app, None);
            }
            watcher.key = None;
            return;
        };
        let due = watcher.advance(&current);
        let submit = due.then(|| {
            (
                state.session.token(),
                state.session.api_url(),
                scrobble_input(&current, watcher.started_at),
            )
        });
        (current, submit)
    };

    watcher.published = true;
    media::publish(
        app,
        Some(NowPlaying {
            title: current.title.clone(),
            artist: current.artist.clone(),
            album: current.album.clone(),
            album_art: Some(current.album_art.clone()).filter(|a| !a.is_empty()),
            duration: current.duration_ms,
            position: current.position_ms,
            is_playing: current.is_playing,
        }),
    );

    let Some((token, api_url, input)) = submit else {
        return;
    };
    if input.title.is_empty() || input.artist.is_empty() {
        // Nothing identifies this track yet (tags still loading, or a bare file
        // path we could not read) — don't post a nameless scrobble.
        return;
    }
    let Some(token) = token else {
        // Signing in mid-track still gets this play scrobbled.
        tracing::debug!("scrobble deferred: not signed in");
        watcher.retry_after = Some(Instant::now() + RETRY_AFTER);
        return;
    };

    match AppView::new(api_url)
        .with_token(token)
        .create_scrobble(&input)
        .await
    {
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

fn scrobble_input(current: &Current, started_at: i64) -> ScrobbleInput {
    ScrobbleInput {
        title: current.title.clone(),
        artist: current.artist.clone(),
        album_artist: current.album_artist.clone(),
        album: Some(current.album.clone()).filter(|a| !a.is_empty()),
        duration: Some(current.duration_ms).filter(|d| *d > 0),
        album_art: Some(current.album_art.clone()).filter(|a| !a.is_empty()),
        timestamp: Some(started_at),
        track_number: current.track_number,
        copyright_message: current.copyright_message.clone(),
        genres: current.genres.clone(),
        release_date: current.release_date.clone(),
        year: current.year,
    }
}
