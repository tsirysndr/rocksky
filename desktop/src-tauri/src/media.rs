//! OS media-session integration via souvlaki: macOS Now Playing (control
//! center + media keys) and Linux MPRIS (the media controls surfaced in
//! notifications and desktop applets). Windows would need an hwnd and is
//! currently a no-op.
//!
//! Two writers, never at once. While Spotify or a remote device is the source,
//! only the webview knows what is playing, so the sticky player pushes the
//! exact state it renders through [`media_set_now_playing`]. While the local
//! engine is the source, [`crate::session`] publishes from the engine snapshot
//! instead — the webview's timers stop running when the window is backgrounded,
//! which used to leave the OS controls frozen on the last visible track.
//!
//! Control events travel the same way, as a `media-control` event the player
//! dispatches through its own transport routing — so a media key hits whatever
//! the miniplayer's buttons would hit.
//!
//! The controls object is main-thread-only on macOS (it hangs off the AppKit
//! event loop Tauri already runs), so it lives in a thread-local and every
//! update goes through `run_on_main_thread`. OS events are `Send` and feed
//! straight into a Tauri event.

use std::cell::RefCell;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
    SeekDirection,
};
use tauri::{AppHandle, Emitter};

thread_local! {
    static CONTROLS: RefCell<Option<MediaControls>> = const { RefCell::new(None) };
    static LAST_METADATA: RefCell<String> = const { RefCell::new(String::new()) };
}

/// What the sticky player is showing — a mirror of the frontend `nowPlaying`
/// atom. Durations are milliseconds, as everywhere else in the frontend.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album: String,
    #[serde(default)]
    pub album_art: Option<String>,
    #[serde(default)]
    pub duration: u64,
    #[serde(default)]
    pub position: u64,
    #[serde(default)]
    pub is_playing: bool,
}

/// A transport action from the OS controls, handed to the webview.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaControl {
    /// `play` | `pause` | `toggle` | `next` | `previous` | `stop` | `seek` |
    /// `seekBy`.
    pub action: &'static str,
    /// Absolute target for `seek`, signed delta for `seekBy` — milliseconds.
    pub position: Option<i64>,
}

impl MediaControl {
    fn new(action: &'static str) -> Self {
        Self {
            action,
            position: None,
        }
    }

    fn at(action: &'static str, position: i64) -> Self {
        Self {
            action,
            position: Some(position),
        }
    }
}

/// Set up the media session. Must be called from the main thread (Tauri's
/// `setup` hook). Failure is non-fatal — playback works without OS controls.
pub fn init(app: &AppHandle) {
    let mut controls = match MediaControls::new(PlatformConfig {
        dbus_name: "app.rocksky.desktop",
        display_name: "Rocksky",
        hwnd: None,
    }) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("media session unavailable: {e:?}");
            return;
        }
    };

    let handle = app.clone();
    if let Err(e) = controls.attach(move |event| {
        let control = match event {
            MediaControlEvent::Play => MediaControl::new("play"),
            MediaControlEvent::Pause => MediaControl::new("pause"),
            MediaControlEvent::Toggle => MediaControl::new("toggle"),
            MediaControlEvent::Next => MediaControl::new("next"),
            MediaControlEvent::Previous => MediaControl::new("previous"),
            MediaControlEvent::Stop => MediaControl::new("stop"),
            MediaControlEvent::Seek(dir) => MediaControl::at("seekBy", signed_ms(dir, 10_000)),
            MediaControlEvent::SeekBy(dir, by) => {
                MediaControl::at("seekBy", signed_ms(dir, by.as_millis() as i64))
            }
            MediaControlEvent::SetPosition(MediaPosition(pos)) => {
                MediaControl::at("seek", pos.as_millis() as i64)
            }
            _ => return,
        };
        let _ = handle.emit("media-control", control);
    }) {
        tracing::warn!("media session events unavailable: {e:?}");
    }

    CONTROLS.with(|c| *c.borrow_mut() = Some(controls));
}

fn signed_ms(dir: SeekDirection, ms: i64) -> i64 {
    match dir {
        SeekDirection::Forward => ms,
        SeekDirection::Backward => -ms,
    }
}

/// Publish the miniplayer's state to the OS controls. `None` clears them (no
/// track loaded).
#[tauri::command]
pub fn media_set_now_playing(app: AppHandle, state: Option<NowPlaying>) -> Result<(), String> {
    app.run_on_main_thread(move || update(state))
        .map_err(|e| e.to_string())
}

/// Same, from any thread and infallible — used by the native session loop
/// (see [`crate::session`]), which owns the controls while the local engine
/// is the source.
pub fn publish(app: &AppHandle, state: Option<NowPlaying>) {
    let _ = app.run_on_main_thread(move || update(state));
}

fn update(state: Option<NowPlaying>) {
    CONTROLS.with(|cell| {
        let mut cell = cell.borrow_mut();
        let Some(controls) = cell.as_mut() else {
            return;
        };

        let Some(np) = state else {
            LAST_METADATA.with(|m| m.borrow_mut().clear());
            let _ = controls.set_playback(MediaPlayback::Stopped);
            return;
        };

        let cover_url = np.album_art.as_deref().filter(|c| !c.is_empty());

        // `set_metadata` replaces the whole Now Playing dictionary and reloads
        // the artwork asynchronously, so push it only when something visible
        // actually changed — on every update the cover would flicker. The key
        // covers the artwork too: it often arrives after the track does.
        let key = format!(
            "{}\u{1}{}\u{1}{}\u{1}{}\u{1}{}",
            np.title,
            np.artist,
            np.album,
            cover_url.unwrap_or_default(),
            np.duration
        );
        let changed = LAST_METADATA.with(|last| {
            if *last.borrow() == key {
                false
            } else {
                *last.borrow_mut() = key;
                true
            }
        });
        if changed {
            let _ = controls.set_metadata(MediaMetadata {
                title: Some(&np.title),
                artist: Some(&np.artist),
                album: Some(&np.album),
                cover_url,
                duration: Some(Duration::from_millis(np.duration)),
            });
        }

        let progress = Some(MediaPosition(Duration::from_millis(np.position)));
        let _ = controls.set_playback(if np.is_playing {
            MediaPlayback::Playing { progress }
        } else {
            MediaPlayback::Paused { progress }
        });
    });
}
