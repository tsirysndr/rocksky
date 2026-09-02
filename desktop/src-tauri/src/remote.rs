//! Bridge between the Rocksky remote-control protocol and the local
//! rockbox-playback engine.
//!
//! `remote_connect` registers this app as a controllable player (shown as
//! "<name> (Desktop)" in the miniplayer device picker), then two tasks run
//! until disconnect:
//! - the command loop applies controller commands (play/pause/seek/queue…)
//!   to the local engine, resolving remote tracks through the media cache;
//! - the status loop pushes now-playing (title/artist/album + codec and
//!   sample rate), transport state, and the queue back to controllers.

use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use rockbox_playback::{PlaybackState, RepeatMode};
use rocksky_sdk::{
    RemoteAudioSettings, RemoteCommand, RemoteNowPlaying, RemotePlayer, RemotePlayerConfig,
    RemoteQueueItem, RemoteRepeat, RemoteStatus, DEFAULT_REMOTE_WS,
};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::cache::MediaCache;
use crate::engine::EngineCmd;
use crate::state::{AppState, RemoteHandle};

pub const DEFAULT_API_URL: &str = "https://api.rocksky.app";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStatusDto {
    pub connected: bool,
    pub name: Option<String>,
    /// The server-assigned device id once registered — lets the frontend
    /// recognize (and hide) this app in its own device picker.
    pub device_id: Option<String>,
}

/// The display name shown in the device picker: the user-chosen name with a
/// "(Desktop)" suffix so this app is recognizable among phones/web players.
fn display_name(name: &str) -> String {
    let base = name.trim();
    let base = if base.is_empty() { "Rocksky" } else { base };
    if base.to_lowercase().ends_with("(desktop)") {
        base.to_string()
    } else {
        format!("{base} (Desktop)")
    }
}

/// Stable cache key for a remote queue item, mirroring the CLI's `cacheId`.
fn cache_id(item: &RemoteQueueItem) -> &str {
    if !item.upload_id.is_empty() {
        &item.upload_id
    } else {
        &item.track_id
    }
}

/// A remote queue item is streamed via the uploads endpoint; Navidrome ids
/// are not resolvable from the desktop app yet. `stream_token` is the opaque
/// short-lived token from `/uploads/stream-token` — the endpoint's `?token=`
/// does a Redis lookup and rejects raw JWTs.
fn stream_url(item: &RemoteQueueItem, api_url: &str, stream_token: &str) -> Option<String> {
    if item.upload_id.is_empty() || stream_token.is_empty() {
        return None;
    }
    Some(format!(
        "{api_url}/uploads/{}/stream?token={stream_token}",
        item.upload_id
    ))
}

/// Fetch (or reuse) the opaque stream token. Server TTL is 1 h; refresh after
/// 50 min so in-flight enqueues never race expiry.
async fn ensure_stream_token(
    http: &reqwest::Client,
    api_url: &str,
    jwt: &str,
    cached: Option<(String, std::time::Instant)>,
) -> Option<(String, std::time::Instant)> {
    if let Some((token, fetched)) = &cached {
        if fetched.elapsed() < Duration::from_secs(50 * 60) && !token.is_empty() {
            return cached;
        }
    }
    #[derive(serde::Deserialize)]
    struct StreamToken {
        token: String,
    }
    let res = http
        .get(format!("{api_url}/uploads/stream-token"))
        .bearer_auth(jwt)
        .send()
        .await;
    match res {
        Ok(res) if res.status().is_success() => match res.json::<StreamToken>().await {
            Ok(body) => Some((body.token, std::time::Instant::now())),
            Err(e) => {
                tracing::warn!("stream-token: bad response body: {e}");
                cached
            }
        },
        Ok(res) => {
            tracing::warn!("stream-token: HTTP {}", res.status());
            cached
        }
        Err(e) => {
            tracing::warn!("stream-token: request failed: {e}");
            cached
        }
    }
}

/// Resolve a remote item to a playable URI: the cached local file when
/// present (gapless, instant, offline), otherwise a streaming URL — and in
/// that case, prefetch it into the cache in the background when enabled.
fn resolve_uri(
    app: &AppHandle,
    item: &RemoteQueueItem,
    api_url: &str,
    stream_token: &str,
) -> Option<String> {
    let cache = app.state::<MediaCache>();
    let id = cache_id(item);
    if let Some(path) = cache.lookup(id) {
        return Some(path.to_string_lossy().into_owned());
    }
    let url = stream_url(item, api_url, stream_token)?;
    if cache.config().enabled {
        let app = app.clone();
        let id = id.to_string();
        let dl_url = url.clone();
        tauri::async_runtime::spawn(async move {
            let cache = app.state::<MediaCache>();
            if let Err(e) = cache.download(&id, &dl_url).await {
                tracing::debug!("cache prefetch skipped for {id}: {e}");
            }
        });
    }
    Some(url)
}

#[tauri::command]
pub async fn remote_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    token: String,
    name: String,
    ws_url: Option<String>,
    api_url: Option<String>,
) -> Result<RemoteStatusDto, String> {
    if token.trim().is_empty() {
        return Err("an access token is required to register as a remote player".into());
    }

    // Replace any previous registration.
    disconnect_inner(&state);

    let shown = display_name(&name);
    let config = RemotePlayerConfig::new(token.clone(), shown.clone())
        .url(ws_url.unwrap_or_else(|| DEFAULT_REMOTE_WS.to_string()));
    let remote = Arc::new(RemotePlayer::connect(config));
    let api_url = api_url
        .unwrap_or_else(|| DEFAULT_API_URL.to_string())
        .trim_end_matches('/')
        .to_string();

    *state.remote.lock().unwrap() = Some(RemoteHandle {
        player: remote.clone(),
        name: shown.clone(),
    });

    // Command loop: controller -> engine. Enqueues stream via the uploads
    // endpoint, which needs an opaque stream token minted from the JWT.
    {
        let app = app.clone();
        let remote = remote.clone();
        let api_url = api_url.clone();
        let token = token.clone();
        tauri::async_runtime::spawn(async move {
            let http = reqwest::Client::new();
            let mut stream_token: Option<(String, std::time::Instant)> = None;
            while let Some(cmd) = remote.next_command().await {
                if matches!(cmd, RemoteCommand::Enqueue { .. }) {
                    stream_token =
                        ensure_stream_token(&http, &api_url, &token, stream_token.take()).await;
                }
                let st = stream_token.as_ref().map(|(t, _)| t.as_str()).unwrap_or("");
                apply(&app, &remote, cmd, &api_url, st);
            }
            tracing::info!("remote command loop ended");
        });
    }

    // Status loop: engine -> controllers, until this registration is replaced.
    {
        let app = app.clone();
        let remote = remote.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                {
                    let state = app.state::<AppState>();
                    let still_current = state
                        .remote
                        .lock()
                        .unwrap()
                        .as_ref()
                        .is_some_and(|h| Arc::ptr_eq(&h.player, &remote));
                    if !still_current {
                        break;
                    }
                    push_state(&state, &remote);
                }
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        });
    }

    Ok(RemoteStatusDto {
        connected: true,
        name: Some(shown),
        device_id: remote.device_id(),
    })
}

#[tauri::command]
pub fn remote_disconnect(state: State<'_, AppState>) -> RemoteStatusDto {
    disconnect_inner(&state);
    RemoteStatusDto {
        connected: false,
        name: None,
        device_id: None,
    }
}

#[tauri::command]
pub fn remote_status(state: State<'_, AppState>) -> RemoteStatusDto {
    let remote = state.remote.lock().unwrap();
    RemoteStatusDto {
        connected: remote.is_some(),
        name: remote.as_ref().map(|h| h.name.clone()),
        device_id: remote.as_ref().and_then(|h| h.player.device_id()),
    }
}

fn disconnect_inner(state: &AppState) {
    if let Some(handle) = state.remote.lock().unwrap().take() {
        handle.player.disconnect();
    }
}

/// Apply one controller command to the local engine.
fn apply(
    app: &AppHandle,
    remote: &RemotePlayer,
    cmd: RemoteCommand,
    api_url: &str,
    stream_token: &str,
) {
    let state = app.state::<AppState>();
    let engine = &state.engine;
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
            let playable: Vec<(RemoteQueueItem, String)> = tracks
                .into_iter()
                .filter_map(|t| resolve_uri(app, &t, api_url, stream_token).map(|uri| (t, uri)))
                .collect();
            if playable.is_empty() {
                tracing::warn!(
                    stream_token_present = !stream_token.is_empty(),
                    "enqueue: no streamable tracks (missing upload ids or stream token)"
                );
                return;
            }
            // Record what each URI was enqueued as; the pushed queue derives
            // its order from the engine and only reads display metadata here.
            {
                let mut items = state.queue_items.lock().unwrap();
                for (item, uri) in &playable {
                    items.insert(uri.clone(), item.clone());
                }
            }
            let uris: Vec<String> = playable.into_iter().map(|(_, uri)| uri).collect();
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
        RemoteCommand::SetAudioSettings(audio) => {
            // Re-applying an unchanged section recomputes filter coefficients
            // and audibly disturbs playback (controllers re-push their whole
            // snapshot on reconnect). Diff per section against the last
            // applied document; an identical or echoed push costs nothing,
            // so settings traffic between controllers can never cycle.
            static LAST_AUDIO: LazyLock<Mutex<RemoteAudioSettings>> =
                LazyLock::new(|| Mutex::new(RemoteAudioSettings::default()));
            let mut changed = RemoteAudioSettings::default();
            {
                let mut last = LAST_AUDIO.lock().unwrap();
                macro_rules! diff_section {
                    ($field:ident) => {
                        if audio.$field.is_some() && audio.$field != last.$field {
                            changed.$field = audio.$field.clone();
                            last.$field = audio.$field.clone();
                        }
                    };
                }
                diff_section!(equalizer);
                diff_section!(tone);
                diff_section!(crossfade);
                diff_section!(replay_gain);
                diff_section!(crossfeed);
                diff_section!(compressor);
                diff_section!(surround);
                diff_section!(pbe);
            }
            for cmd in crate::dsp::remote_audio_commands(&changed) {
                engine.send(cmd);
            }
        }
    }
    push_state(&state, remote);
}

/// Push now-playing + transport state + queue to controllers.
pub fn push_state(state: &AppState, remote: &RemotePlayer) {
    let snapshot = state.engine.snapshot();
    let status = snapshot.status;
    // Derived, not mirrored: the engine's queue order mapped through the URI
    // registries. The engine inserts relative to its own (decoder) index and
    // reorders freely, so any positional mirror kept alongside it would
    // eventually point controllers at the wrong "now playing" row.
    let meta = state.derived_queue(&snapshot.queue);
    let current = status.index.and_then(|i| meta.get(i));

    let mut np = RemoteNowPlaying {
        duration_ms: status.duration.as_millis() as u64,
        elapsed_ms: status.position.as_millis() as u64,
        is_playing: status.state == PlaybackState::Playing,
        // Advertised because this engine has all three — that is the signal a
        // controller uses to decide whether to show the controls at all.
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
    // Remote enqueues know their album art; tags of local files don't carry a URL.
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

    remote.set_now_playing(np);
    remote.set_status(match status.state {
        PlaybackState::Playing => RemoteStatus::Playing,
        PlaybackState::Paused => RemoteStatus::Paused,
        PlaybackState::Stopped => RemoteStatus::Stopped,
    });
    remote.set_queue(meta, status.index.unwrap_or(0) as u32);
}
