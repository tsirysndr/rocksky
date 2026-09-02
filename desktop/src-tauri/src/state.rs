use std::collections::HashMap;
use std::sync::Mutex;

use rocksky_sdk::{RemotePlayer, RemoteQueueItem};

use crate::engine::Engine;
use crate::session::Session;

/// Everything the Tauri commands share. The playback engine itself lives on
/// its own thread (see [`Engine`]); this is all `Send + Sync` handles.
pub struct AppState {
    pub engine: Engine,
    /// The remote-control registration, when connected.
    pub remote: Mutex<Option<RemoteHandle>>,
    /// Display metadata for every URI this app has enqueued, keyed by the
    /// exact queue string. The ENGINE's queue is the source of truth for
    /// order — it inserts relative to its own (decoder) index and reorders
    /// freely, so a positional mirror inevitably drifts; everything shown to
    /// controllers derives from the engine queue mapped through this (and the
    /// session registry, see [`AppState::item_for_uri`]).
    pub queue_items: Mutex<HashMap<String, RemoteQueueItem>>,
    /// What the native OS-media/scrobble loop needs from the webview.
    pub session: Session,
}

pub struct RemoteHandle {
    pub player: std::sync::Arc<RemotePlayer>,
    /// Display name registered with the remote-ws server.
    pub name: String,
}

impl AppState {
    pub fn new(engine: Engine) -> Self {
        Self {
            engine,
            remote: Mutex::new(None),
            queue_items: Mutex::new(HashMap::new()),
            session: Session::default(),
        }
    }

    /// Display item for a queue URI, richest source first: what it was
    /// enqueued as (remote enqueues / local-file tags / the shim's queue
    /// metadata), then the webview session registry (whose stable-id fallback
    /// survives rotating stream tokens), then tags/filename so an unknown URI
    /// still renders instead of leaving a hole.
    pub fn item_for_uri(&self, uri: &str) -> RemoteQueueItem {
        if let Some(item) = self.queue_items.lock().unwrap().get(uri) {
            return item.clone();
        }
        if let Some(meta) = self.session.lookup(uri) {
            return RemoteQueueItem {
                upload_id: meta.upload_id,
                title: meta.title,
                artist: meta.artist,
                album: meta.album,
                album_artist: meta.album_artist,
                album_art: meta.album_art,
                duration_ms: meta.duration,
                track_number: meta.track_number.unwrap_or(0),
                ..Default::default()
            };
        }
        crate::player::local_queue_item(uri)
    }

    /// The queue as controllers should see it: the ENGINE's queue order, each
    /// URI mapped through [`AppState::item_for_uri`].
    pub fn derived_queue(&self, engine_uris: &[String]) -> Vec<RemoteQueueItem> {
        engine_uris.iter().map(|u| self.item_for_uri(u)).collect()
    }
}
