//! Bridge between the Rocksky remote-control protocol and the local
//! rockbox-playback engine.
//!
//! Two loops run until disconnect: the command loop applies controller
//! commands (play/pause/seek/queue…) to the engine, resolving remote tracks
//! to stream URLs; the status loop pushes now-playing, transport state, and
//! the queue back to controllers so this daemon shows up (and stays live) in
//! the miniplayer device picker.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rockbox_playback::{PlaybackState, RepeatMode};
use rocksky_sdk::{
    RemoteCommand, RemoteNowPlaying, RemotePlayer, RemoteQueueItem, RemoteRepeat, RemoteStatus,
};

use crate::engine::{Engine, EngineCmd};
use crate::resolver::Resolver;
use crate::resume;
use crate::settings::SettingsSync;

pub struct Shared {
    pub engine: Arc<Engine>,
    pub remote: Arc<RemotePlayer>,
    /// Section-diffing settings applier, shared with the atproto/Jetstream
    /// sync so every source dedupes against the same last-applied document.
    pub settings_sync: Arc<SettingsSync>,
    /// Every URI this daemon has enqueued, with the item it was enqueued as.
    /// Keyed by URI rather than position because the ENGINE's queue is the
    /// source of truth for order — it inserts relative to its own (decoder)
    /// index and reorders (shuffle) / shrinks (remove) freely, so a
    /// positional mirror inevitably drifts. Everything shown to controllers
    /// is derived by mapping the engine queue through this registry.
    pub uri_meta: Mutex<HashMap<String, RemoteQueueItem>>,
    /// Where the metadata sidecar lives; `None` disables persistence.
    pub sidecar_path: Option<PathBuf>,
    /// Where shuffle/repeat persist across restarts; `None` disables it.
    pub transport_path: Option<PathBuf>,
    /// Last transport prefs written, so the file is only rewritten on change.
    last_transport: Mutex<Option<resume::Transport>>,
    /// Hash of the last queue push, so the full track list is only re-sent
    /// when the queue or the current index actually changes.
    queue_sig: Mutex<u64>,
}

impl Shared {
    pub fn new(
        engine: Arc<Engine>,
        remote: Arc<RemotePlayer>,
        settings_sync: Arc<SettingsSync>,
        sidecar_path: Option<PathBuf>,
        transport_path: Option<PathBuf>,
    ) -> Self {
        Shared {
            engine,
            remote,
            settings_sync,
            uri_meta: Mutex::new(HashMap::new()),
            sidecar_path,
            transport_path,
            last_transport: Mutex::new(None),
            queue_sig: Mutex::new(0),
        }
    }

    /// Re-apply the persisted shuffle/repeat. Call once at startup, after the
    /// engine boots with the TOML defaults — the last live setting is newer.
    /// Also seeds the change detector so the first push doesn't rewrite the
    /// file with what it just read.
    pub fn restore_transport(&self) {
        let Some(path) = &self.transport_path else {
            return;
        };
        let Some(t) = resume::Transport::load(path) else {
            return;
        };
        tracing::info!(shuffle = t.shuffle, repeat = %t.repeat, volume = ?t.volume, "restoring transport prefs");
        self.engine.send(EngineCmd::SetShuffle(t.shuffle));
        self.engine.send(EngineCmd::SetRepeat(t.repeat_mode()));
        if let Some(volume) = t.volume {
            self.engine.send(EngineCmd::SetVolume(volume.clamp(0.0, 1.0)));
        }
        *self.last_transport.lock().unwrap() = Some(t);
    }

    /// Remember what each URI was enqueued as — this is what queue pushes and
    /// scrobbles read — and persist it so a restart can rebuild the queue's
    /// metadata and re-mint expired stream URLs.
    pub fn remember_uris(&self, pairs: impl IntoIterator<Item = (String, RemoteQueueItem)>) {
        let sidecar = {
            let mut uri_meta = self.uri_meta.lock().unwrap();
            uri_meta.extend(pairs);
            // Recording is unconditional; only persistence needs a path.
            if self.sidecar_path.is_none() {
                return;
            }
            resume::Sidecar {
                items: uri_meta
                    .iter()
                    .map(|(uri, item)| (uri.clone(), item.into()))
                    .collect(),
            }
        };
        if let Some(path) = &self.sidecar_path {
            sidecar.save(path);
        }
    }

    /// The queue as controllers should see it: the ENGINE's queue order, each
    /// URI mapped to the item it was enqueued as. An unknown URI (e.g. a
    /// resumed queue whose sidecar was lost) degrades to a filename-derived
    /// entry, never a hole.
    pub fn derived_queue(&self, engine_uris: &[String]) -> Vec<RemoteQueueItem> {
        let uri_meta = self.uri_meta.lock().unwrap();
        engine_uris
            .iter()
            .map(|uri| {
                uri_meta
                    .get(uri)
                    .cloned()
                    .unwrap_or_else(|| fallback_item(uri))
            })
            .collect()
    }
}

/// Display fallback for a URI with no registry entry: local files get their
/// file stem as the title; stream URLs stay blank rather than showing
/// "stream?token=…" on every controller.
fn fallback_item(uri: &str) -> RemoteQueueItem {
    let mut item = RemoteQueueItem::default();
    if !(uri.starts_with("http://") || uri.starts_with("https://")) {
        item.title = std::path::Path::new(uri)
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| uri.to_string());
    }
    item
}

pub async fn command_loop(shared: Arc<Shared>, mut resolver: Resolver) {
    while let Some(cmd) = shared.remote.next_command().await {
        apply(&shared, &mut resolver, cmd).await;
        // Engine setters are fire-and-forget; give its thread a beat to
        // process and refresh the snapshot before reflecting state back.
        tokio::time::sleep(Duration::from_millis(150)).await;
        push_state(&shared);
    }
    tracing::info!("remote command loop ended");
}

pub async fn status_loop(shared: Arc<Shared>) {
    loop {
        push_state(&shared);
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

async fn apply(shared: &Shared, resolver: &mut Resolver, cmd: RemoteCommand) {
    let engine = &shared.engine;
    match cmd {
        RemoteCommand::Play => engine.send(EngineCmd::Play),
        RemoteCommand::Pause => engine.send(EngineCmd::Pause),
        RemoteCommand::Next => engine.send(EngineCmd::Next),
        RemoteCommand::Previous => engine.send(EngineCmd::Previous),
        RemoteCommand::Seek { position_ms } => {
            engine.send(EngineCmd::Seek(Duration::from_millis(position_ms)))
        }
        RemoteCommand::QueueJump { index } => engine.send(EngineCmd::SkipTo(index as usize)),
        // Queue edits go straight to the engine (which bounds-checks); the
        // pushed queue is derived from the engine's order, so there is no
        // mirror to keep in step.
        RemoteCommand::QueueRemove { index } => engine.send(EngineCmd::Remove(index as usize)),
        RemoteCommand::QueueMove { from, to } => {
            if from != to {
                engine.send(EngineCmd::Move {
                    from: from as usize,
                    to: to as usize,
                });
            }
        }
        RemoteCommand::Enqueue {
            tracks,
            mode,
            shuffle,
            start_index,
        } => {
            let mut playable: Vec<(RemoteQueueItem, String)> = Vec::with_capacity(tracks.len());
            for track in tracks {
                match resolver.resolve(&track).await {
                    Some(uri) => playable.push((track, uri)),
                    None => tracing::warn!(
                        title = track.title.as_str(),
                        "enqueue: track is not streamable, skipping"
                    ),
                }
            }
            if playable.is_empty() {
                tracing::warn!("enqueue: no streamable tracks");
                return;
            }
            let uris: Vec<String> = playable.iter().map(|(_, uri)| uri.clone()).collect();
            // Record before the move: this is the only point where the URI the
            // engine will hold and the item it means are both in hand.
            shared.remember_uris(
                playable
                    .iter()
                    .map(|(item, uri)| (uri.clone(), item.clone())),
            );
            match mode.as_str() {
                "next" => engine.send(EngineCmd::InsertNext(uris)),
                "last" => engine.send(EngineCmd::Append(uris)),
                _ => {
                    // "now": replace the queue and start at the requested track.
                    engine.send(EngineCmd::OpenAt {
                        paths: uris,
                        start_index: start_index as usize,
                        shuffle,
                    });
                }
            }
        }
        RemoteCommand::SetShuffle { enabled } => engine.send(EngineCmd::SetShuffle(enabled)),
        RemoteCommand::SetRepeat { mode } => engine.send(EngineCmd::SetRepeat(match mode {
            RemoteRepeat::All => RepeatMode::All,
            RemoteRepeat::One => RepeatMode::One,
            RemoteRepeat::Off => RepeatMode::Off,
        })),
        RemoteCommand::SetVolume { volume } => {
            engine.send(EngineCmd::SetVolume(volume.clamp(0.0, 1.0)))
        }
        RemoteCommand::SetAudioSettings(audio) => shared.settings_sync.apply(engine, &audio),
    }
}

/// Push now-playing + transport state to controllers, and the queue when it
/// changed.
pub fn push_state(shared: &Shared) {
    let snapshot = shared.engine.snapshot();
    let status = snapshot.status;
    // Derived, not mirrored: the engine's queue order mapped through the URI
    // registry. The engine inserts relative to its own (decoder) index and
    // reorders freely, so any positional mirror kept alongside it would
    // eventually point controllers at the wrong "now playing" row.
    let meta = shared.derived_queue(&snapshot.queue);
    let current = status.index.and_then(|i| meta.get(i));

    let mut np = RemoteNowPlaying {
        duration_ms: status.duration.as_millis() as u64,
        elapsed_ms: status.position.as_millis() as u64,
        is_playing: status.state == PlaybackState::Playing,
        // This engine has all three, so advertise them — that is what tells a
        // controller it may show the shuffle/repeat/volume controls.
        shuffle: Some(status.shuffle),
        repeat: Some(match status.repeat {
            RepeatMode::All => RemoteRepeat::All,
            RepeatMode::One => RemoteRepeat::One,
            _ => RemoteRepeat::Off,
        }),
        volume: Some(snapshot.volume),
        ..Default::default()
    };
    if let Some(m) = &status.metadata {
        np.title = m.title.clone();
        np.artist = m.artist.clone();
        np.album = m.album.clone();
        np.album_artist = m.albumartist.clone();
        np.codec = Some(m.codec.to_lowercase());
        np.sample_rate = Some(m.sample_rate);
    }
    // Remote enqueues know their album art; file tags don't carry a URL.
    if let Some(item) = current {
        if np.title.is_empty() {
            np.title = item.title.clone();
        }
        if np.artist.is_empty() {
            np.artist = item.artist.clone();
        }
        if np.album.is_empty() {
            np.album = item.album.clone();
        }
        np.album_art = item.album_art.clone();
    }

    shared.remote.set_now_playing(np);
    shared.remote.set_status(match status.state {
        PlaybackState::Playing => RemoteStatus::Playing,
        PlaybackState::Paused => RemoteStatus::Paused,
        PlaybackState::Stopped => RemoteStatus::Stopped,
    });

    // Persist the OBSERVED shuffle/repeat/volume, not the command sites — an
    // enqueue's shuffle flag changes them just as much as a shuffle/repeat
    // command does, and the engine's resume file can't carry any of them.
    if let Some(path) = &shared.transport_path {
        let now = resume::Transport {
            shuffle: status.shuffle,
            repeat: match status.repeat {
                RepeatMode::All => "all",
                RepeatMode::One => "one",
                _ => "off",
            }
            .to_string(),
            volume: Some(snapshot.volume),
        };
        let mut last = shared.last_transport.lock().unwrap();
        if last.as_ref() != Some(&now) {
            now.save(path);
            *last = Some(now);
        }
    }

    let mut hasher = DefaultHasher::new();
    status.index.unwrap_or(0).hash(&mut hasher);
    meta.len().hash(&mut hasher);
    for item in meta.iter() {
        item.upload_id.hash(&mut hasher);
        item.track_id.hash(&mut hasher);
        item.title.hash(&mut hasher);
    }
    let sig = hasher.finish();
    let mut last = shared.queue_sig.lock().unwrap();
    if *last != sig {
        *last = sig;
        shared
            .remote
            .set_queue(meta, status.index.unwrap_or(0) as u32);
    }
}
