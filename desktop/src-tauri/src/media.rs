//! OS media-session integration via souvlaki: macOS Now Playing (control
//! center + media keys) and Linux MPRIS (the media controls surfaced in
//! notifications and desktop applets). Windows would need an hwnd and is
//! currently a no-op.
//!
//! The controls object is main-thread-only on macOS (it hangs off the AppKit
//! event loop Tauri already runs), so it lives in a thread-local and every
//! update goes through `run_on_main_thread`. OS events are `Send` and feed
//! straight into the engine's command channel.

use std::cell::RefCell;
use std::time::Duration;

use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition,
    PlatformConfig, SeekDirection,
};
use tauri::{AppHandle, Manager};

use crate::engine::{EngineCmd, Snapshot};
use crate::state::AppState;

thread_local! {
    static CONTROLS: RefCell<Option<MediaControls>> = const { RefCell::new(None) };
    static LAST_TRACK: RefCell<String> = const { RefCell::new(String::new()) };
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

    let engine_tx = app.state::<AppState>().engine.sender();
    if let Err(e) = controls.attach(move |event| {
        let cmd = match event {
            MediaControlEvent::Play => EngineCmd::Play,
            MediaControlEvent::Pause => EngineCmd::Pause,
            MediaControlEvent::Toggle => EngineCmd::Toggle,
            MediaControlEvent::Next => EngineCmd::Next,
            MediaControlEvent::Previous => EngineCmd::Previous,
            MediaControlEvent::Seek(SeekDirection::Forward) => EngineCmd::SeekBy(10_000),
            MediaControlEvent::Seek(SeekDirection::Backward) => EngineCmd::SeekBy(-10_000),
            MediaControlEvent::SetPosition(MediaPosition(pos)) => EngineCmd::Seek(pos),
            MediaControlEvent::Stop => EngineCmd::Stop,
            _ => return,
        };
        let _ = engine_tx.send(cmd);
    }) {
        tracing::warn!("media session events unavailable: {e:?}");
    }

    CONTROLS.with(|c| *c.borrow_mut() = Some(controls));

    // Push engine state to the OS once a second (metadata only on track change).
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let (snap, cover) = {
                let state = app.state::<AppState>();
                let snap = state.engine.snapshot();
                let cover = snap
                    .status
                    .index
                    .and_then(|i| state.queue_meta.lock().unwrap().get(i).cloned())
                    .map(|item| item.album_art);
                (snap, cover)
            };
            if app.run_on_main_thread(move || update(snap, cover)).is_err() {
                break;
            }
        }
    });
}

fn update(snap: Snapshot, cover: Option<String>) {
    CONTROLS.with(|cell| {
        let mut cell = cell.borrow_mut();
        let Some(controls) = cell.as_mut() else {
            return;
        };

        let status = &snap.status;
        let (title, artist, album) = match &status.metadata {
            Some(m) => (m.title.clone(), m.artist.clone(), m.album.clone()),
            None => (String::new(), String::new(), String::new()),
        };

        let key = format!("{title}\u{1}{artist}\u{1}{album}");
        let changed = LAST_TRACK.with(|t| {
            if *t.borrow() == key {
                false
            } else {
                *t.borrow_mut() = key;
                true
            }
        });
        if changed {
            let cover_url = cover.as_deref().filter(|c| !c.is_empty());
            let _ = controls.set_metadata(MediaMetadata {
                title: Some(&title),
                artist: Some(&artist),
                album: Some(&album),
                cover_url,
                duration: Some(status.duration),
            });
        }

        let progress = Some(MediaPosition(status.position));
        let playback = match status.state {
            rockbox_playback::PlaybackState::Playing => MediaPlayback::Playing { progress },
            rockbox_playback::PlaybackState::Paused => MediaPlayback::Paused { progress },
            rockbox_playback::PlaybackState::Stopped => MediaPlayback::Stopped,
        };
        let _ = controls.set_playback(playback);
    });
}
