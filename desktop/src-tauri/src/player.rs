use std::time::Duration;

use rockbox_playback::{PlaybackState, RepeatMode};
use rocksky_sdk::RemoteQueueItem;
use serde::Serialize;
use tauri::State;

use crate::engine::EngineCmd;
use crate::state::AppState;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StatusDto {
    pub state: String,
    pub index: Option<usize>,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub queue_len: usize,
    pub shuffle: bool,
    pub repeat: String,
    pub volume: f32,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub codec: Option<String>,
    pub sample_rate: Option<u32>,
    pub bitrate: Option<u32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QueueItemDto {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art: String,
    pub duration_ms: u64,
}

fn repeat_label(mode: RepeatMode) -> &'static str {
    match mode {
        RepeatMode::One => "one",
        RepeatMode::All => "all",
        _ => "off",
    }
}

pub fn snapshot(state: &AppState) -> StatusDto {
    let snap = state.engine.snapshot();
    let s = snap.status;
    let (title, artist, album, codec, sample_rate, bitrate) = match &s.metadata {
        Some(m) => (
            m.title.clone(),
            m.artist.clone(),
            m.album.clone(),
            Some(m.codec.to_lowercase()),
            Some(m.sample_rate),
            Some(m.bitrate),
        ),
        None => (
            String::new(),
            String::new(),
            String::new(),
            None,
            None,
            None,
        ),
    };
    StatusDto {
        state: match s.state {
            PlaybackState::Playing => "playing",
            PlaybackState::Paused => "paused",
            PlaybackState::Stopped => "stopped",
        }
        .to_string(),
        index: s.index,
        position_ms: s.position.as_millis() as u64,
        duration_ms: s.duration.as_millis() as u64,
        queue_len: s.queue_len,
        shuffle: s.shuffle,
        repeat: repeat_label(s.repeat).to_string(),
        volume: snap.volume,
        title,
        artist,
        album,
        codec,
        sample_rate,
        bitrate,
    }
}

/// Derive display metadata for local files so the queue (and controllers)
/// show tags instead of bare paths.
pub fn local_queue_item(path: &str) -> RemoteQueueItem {
    let mut item = RemoteQueueItem::default();
    // Only local files carry readable tags. For an HTTP stream URL, file_stem()
    // returns the last path segment — literally "stream?token=…" — which then
    // shows up as the track title on any controller watching this device. Leave
    // it blank instead; the frontend fills real metadata via
    // player_set_queue_meta, which knows what it enqueued.
    if path.starts_with("http://") || path.starts_with("https://") {
        item.upload_id = upload_id_from_url(path).unwrap_or_default();
        return item;
    }
    match rockbox_metadata::read(path) {
        Ok(m) => {
            item.title = if m.title.is_empty() {
                file_stem(path)
            } else {
                m.title
            };
            item.artist = m.artist;
            item.album = m.album;
            item.album_artist = m.albumartist;
            item.duration_ms = m.duration.as_millis() as u64;
            item.track_number = m.track_number.unwrap_or(0) as i32;
        }
        Err(_) => item.title = file_stem(path),
    }
    item
}

/// The uploadId embedded in a stream URL, so a URL-only queue entry still has a
/// stable identity for the cache and for controller-side lookups.
fn upload_id_from_url(url: &str) -> Option<String> {
    let after = url.split("/uploads/").nth(1)?;
    let id = after.split('/').next()?;
    (!id.is_empty()).then(|| id.to_string())
}

fn file_stem(path: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

/// Record display metadata for local paths so controllers see tags instead of
/// bare filenames. Stream URLs are skipped — their metadata comes from the
/// shim's queue metadata / session registry / remote enqueues, and a
/// mostly-empty entry here would shadow those richer sources (see
/// `AppState::item_for_uri`).
fn remember_local(state: &AppState, paths: &[String]) {
    let mut items = state.queue_items.lock().unwrap();
    for p in paths {
        if p.starts_with("http://") || p.starts_with("https://") || items.contains_key(p) {
            continue;
        }
        items.insert(p.clone(), local_queue_item(p));
    }
}

#[tauri::command]
pub fn player_open(state: State<'_, AppState>, paths: Vec<String>) {
    remember_local(&state, &paths);
    state.engine.send(EngineCmd::Open(paths));
}

/// wasm-parity `setQueue(urls, autoplay)`: replace the queue, cue-only unless
/// `autoplay`.
#[tauri::command]
pub fn player_set_queue(state: State<'_, AppState>, paths: Vec<String>, autoplay: bool) {
    remember_local(&state, &paths);
    state.engine.send(EngineCmd::SetQueue { paths, autoplay });
}

/// wasm-parity `insert(urls, mode, index)` with rockbox insertion-mode codes.
#[tauri::command]
pub fn player_insert(state: State<'_, AppState>, paths: Vec<String>, mode: u8, index: usize) {
    remember_local(&state, &paths);
    state.engine.send(EngineCmd::Insert { paths, mode, index });
}

/// The queue's URLs/paths, verbatim (for the shim's queue events).
#[tauri::command]
pub fn player_queue_paths(state: State<'_, AppState>) -> Vec<String> {
    state.engine.snapshot().queue
}

/// The frontend's view of a queue entry. `RemoteQueueItem` in the SDK is
/// serialize-only, so commands take this and convert.
#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct QueueMetaDto {
    pub upload_id: String,
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub album_art: String,
    pub duration_ms: u64,
    pub song_uri: String,
    pub album_uri: String,
    pub track_number: i32,
}

impl From<QueueMetaDto> for RemoteQueueItem {
    fn from(d: QueueMetaDto) -> Self {
        RemoteQueueItem {
            upload_id: d.upload_id,
            track_id: d.track_id,
            title: d.title,
            artist: d.artist,
            album: d.album,
            album_artist: d.album_artist,
            album_art: d.album_art,
            duration_ms: d.duration_ms,
            song_uri: d.song_uri,
            album_uri: d.album_uri,
            track_number: d.track_number,
        }
    }
}

/// Record what the frontend actually enqueued, keyed by the URL each item was
/// enqueued as. The shim holds the rich QueueTrack for every URL it queued,
/// so this is the main source of real titles for streamed (non-file) entries.
/// Additive — order comes from the engine queue, never from this call.
#[tauri::command]
pub fn player_set_queue_meta(
    state: State<'_, AppState>,
    paths: Vec<String>,
    items: Vec<QueueMetaDto>,
) {
    let mut map = state.queue_items.lock().unwrap();
    for (path, item) in paths.into_iter().zip(items) {
        // The shim sends an empty entry for URLs its resolver doesn't know;
        // storing that would shadow the session-registry fallback.
        if !item.title.is_empty() {
            map.insert(path, item.into());
        }
    }
}

#[tauri::command]
pub fn player_enqueue(state: State<'_, AppState>, paths: Vec<String>) {
    remember_local(&state, &paths);
    state.engine.send(EngineCmd::Append(paths));
}

#[tauri::command]
pub fn player_play(state: State<'_, AppState>) {
    state.engine.send(EngineCmd::Play);
}

#[tauri::command]
pub fn player_pause(state: State<'_, AppState>) {
    state.engine.send(EngineCmd::Pause);
}

#[tauri::command]
pub fn player_toggle(state: State<'_, AppState>) {
    state.engine.send(EngineCmd::Toggle);
}

#[tauri::command]
pub fn player_stop(state: State<'_, AppState>) {
    state.engine.send(EngineCmd::Stop);
}

#[tauri::command]
pub fn player_next(state: State<'_, AppState>) {
    state.engine.send(EngineCmd::Next);
}

#[tauri::command]
pub fn player_previous(state: State<'_, AppState>) {
    state.engine.send(EngineCmd::Previous);
}

#[tauri::command]
pub fn player_seek(state: State<'_, AppState>, position_ms: u64) {
    state
        .engine
        .send(EngineCmd::Seek(Duration::from_millis(position_ms)));
}

#[tauri::command]
pub fn player_skip_to(state: State<'_, AppState>, index: usize) {
    state.engine.send(EngineCmd::SkipTo(index));
}

// Queue edits go straight to the engine (which bounds-checks); everything
// shown for the queue is derived from the engine's order, so there is no
// positional mirror to keep in step.

#[tauri::command]
pub fn player_remove(state: State<'_, AppState>, index: usize) {
    state.engine.send(EngineCmd::Remove(index));
}

#[tauri::command]
pub fn player_move(state: State<'_, AppState>, from: usize, to: usize) {
    if from != to {
        state.engine.send(EngineCmd::Move { from, to });
    }
}

#[tauri::command]
pub fn player_clear_queue(state: State<'_, AppState>) {
    state.engine.send(EngineCmd::ClearQueue);
}

#[tauri::command]
pub fn player_set_volume(state: State<'_, AppState>, volume: f32) {
    state
        .engine
        .send(EngineCmd::SetVolume(volume.clamp(0.0, 1.0)));
}

#[tauri::command]
pub fn player_set_shuffle(state: State<'_, AppState>, enabled: bool) {
    state.engine.send(EngineCmd::SetShuffle(enabled));
}

#[tauri::command]
pub fn player_set_repeat(state: State<'_, AppState>, mode: String) {
    let mode = match mode.as_str() {
        "one" => RepeatMode::One,
        "all" => RepeatMode::All,
        _ => RepeatMode::Off,
    };
    state.engine.send(EngineCmd::SetRepeat(mode));
}

#[tauri::command]
pub fn player_status(state: State<'_, AppState>) -> StatusDto {
    snapshot(&state)
}

// ── DSP commands (wasm RockboxPlayer parity; codes are wasm raw ints) ──────

#[tauri::command]
pub fn player_set_eq_enabled(state: State<'_, AppState>, enabled: bool) {
    state.engine.send(EngineCmd::SetEqEnabled(enabled));
}

#[tauri::command]
pub fn player_set_eq_band(
    state: State<'_, AppState>,
    band: usize,
    cutoff_hz: i32,
    q: f32,
    gain_db: f32,
) {
    state.engine.send(EngineCmd::SetEqBand {
        band,
        cutoff_hz,
        q,
        gain_db,
    });
}

#[tauri::command]
pub fn player_set_eq_precut(state: State<'_, AppState>, db: f32) {
    state.engine.send(EngineCmd::SetEqPrecut(db));
}

#[tauri::command]
pub fn player_set_tone(state: State<'_, AppState>, bass_db: i32, treble_db: i32) {
    state.engine.send(EngineCmd::SetTone { bass_db, treble_db });
}

#[tauri::command]
pub fn player_set_tone_cutoffs(state: State<'_, AppState>, bass_hz: i32, treble_hz: i32) {
    state
        .engine
        .send(EngineCmd::SetToneCutoffs { bass_hz, treble_hz });
}

#[tauri::command]
pub fn player_set_crossfade(state: State<'_, AppState>, mode: u8, opts: crate::dsp::CrossfadeOpts) {
    state.engine.send(EngineCmd::SetCrossfade { mode, opts });
}

#[tauri::command]
pub fn player_set_channel_mode(state: State<'_, AppState>, mode: u8) {
    state.engine.send(EngineCmd::SetChannelMode(mode));
}

#[tauri::command]
pub fn player_set_stereo_width(state: State<'_, AppState>, percent: i32) {
    state.engine.send(EngineCmd::SetStereoWidth(percent));
}

#[tauri::command]
pub fn player_set_replaygain(state: State<'_, AppState>, mode: u8, noclip: bool, preamp_db: f32) {
    state.engine.send(EngineCmd::SetReplaygain {
        mode,
        noclip,
        preamp_db,
    });
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn player_set_crossfeed(
    state: State<'_, AppState>,
    mode: u8,
    direct_gain: i32,
    cross_gain: i32,
    high_freq_gain: i32,
    hf_cutoff: i32,
) {
    state.engine.send(EngineCmd::SetCrossfeed {
        mode,
        direct_gain,
        cross_gain,
        high_freq_gain,
        hf_cutoff,
    });
}

#[tauri::command]
pub fn player_set_pbe(state: State<'_, AppState>, strength: i32, precut: i32) {
    state.engine.send(EngineCmd::SetPbe { strength, precut });
}

#[tauri::command]
pub fn player_set_compressor(state: State<'_, AppState>, opts: crate::dsp::CompressorOpts) {
    state.engine.send(EngineCmd::SetCompressor(opts));
}

#[tauri::command]
pub fn player_set_surround(state: State<'_, AppState>, opts: crate::dsp::SurroundOpts) {
    state.engine.send(EngineCmd::SetSurround(opts));
}

#[tauri::command]
pub fn player_queue(state: State<'_, AppState>) -> Vec<QueueItemDto> {
    state
        .derived_queue(&state.engine.snapshot().queue)
        .iter()
        .map(|i| QueueItemDto {
            title: i.title.clone(),
            artist: i.artist.clone(),
            album: i.album.clone(),
            album_art: i.album_art.clone(),
            duration_ms: i.duration_ms,
        })
        .collect()
}
