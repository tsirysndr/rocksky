use std::sync::Mutex;

use rocksky_sdk::{RemotePlayer, RemoteQueueItem};

use crate::engine::Engine;

/// Everything the Tauri commands share. The playback engine itself lives on
/// its own thread (see [`Engine`]); this is all `Send + Sync` handles.
pub struct AppState {
    pub engine: Engine,
    /// The remote-control registration, when connected.
    pub remote: Mutex<Option<RemoteHandle>>,
    /// Mirror of the playback queue with display metadata — remote enqueues
    /// carry full track info, local file opens are derived from tags/filenames.
    /// Kept in lockstep with the engine queue so controllers see real titles.
    pub queue_meta: Mutex<Vec<RemoteQueueItem>>,
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
            queue_meta: Mutex::new(Vec::new()),
        }
    }
}
