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
    pub queue_meta: Mutex<Vec<RemoteQueueItem>>,
    /// Every URI this daemon has enqueued, with the item it was enqueued as.
    /// Keyed by URI rather than position because the engine's queue is what
    /// gets persisted, and it reorders (shuffle) and shrinks (remove) freely.
    pub uri_meta: Mutex<HashMap<String, RemoteQueueItem>>,
    /// Where the metadata sidecar lives; empty disables persistence.
    pub sidecar_path: Option<PathBuf>,
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
    ) -> Self {
        Shared {
            engine,
            remote,
            settings_sync,
            queue_meta: Mutex::new(Vec::new()),
            uri_meta: Mutex::new(HashMap::new()),
            sidecar_path,
            queue_sig: Mutex::new(0),
        }
    }

    /// Remember what each URI was enqueued as, and persist it so a restart can
    /// rebuild the queue's metadata and re-mint expired stream URLs.
    pub fn remember_uris(&self, pairs: impl IntoIterator<Item = (String, RemoteQueueItem)>) {
        let Some(path) = &self.sidecar_path else {
            return;
        };
        let sidecar = {
            let mut uri_meta = self.uri_meta.lock().unwrap();
            uri_meta.extend(pairs);
            resume::Sidecar {
                items: uri_meta
                    .iter()
                    .map(|(uri, item)| (uri.clone(), item.into()))
                    .collect(),
            }
        };
        sidecar.save(path);
    }
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
        RemoteCommand::QueueRemove { index } => {
            let mut meta = shared.queue_meta.lock().unwrap();
            if (index as usize) < meta.len() {
                meta.remove(index as usize);
            }
            engine.send(EngineCmd::Remove(index as usize));
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
            let items: Vec<RemoteQueueItem> = playable.into_iter().map(|(t, _)| t).collect();
            let mut meta = shared.queue_meta.lock().unwrap();
            match mode.as_str() {
                "next" => {
                    let insert_at = shared
                        .engine
                        .snapshot()
                        .status
                        .index
                        .map(|i| i + 1)
                        .unwrap_or(0)
                        .min(meta.len());
                    meta.splice(insert_at..insert_at, items);
                    engine.send(EngineCmd::InsertNext(uris));
                }
                "last" => {
                    meta.extend(items);
                    engine.send(EngineCmd::Append(uris));
                }
                _ => {
                    // "now": replace the queue and start at the requested track.
                    *meta = items;
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
    let meta = shared.queue_meta.lock().unwrap();
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
            .set_queue(meta.clone(), status.index.unwrap_or(0) as u32);
    }
}
