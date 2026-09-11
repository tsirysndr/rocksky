//! The controller side of the remote protocol, folded into a readable world.
//!
//! [`RemoteController`] hands out a stream of push events; a tool call needs a
//! snapshot. This module runs the event pump and keeps the last known state of
//! every device the account has — which is also what makes commands
//! addressable by name ("Living Room") instead of by opaque device id.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use anyhow::{bail, Result};
use rocksky_sdk::{
    RemoteController, RemoteControllerConfig, RemoteEvent, RemoteNowPlaying, RemoteQueueItem,
    RemoteStatus,
};
use serde_json::{json, Value};
use tokio::sync::watch;

use crate::config::Config;

/// How long a tool waits for the first device snapshot after connecting.
const SEED_TIMEOUT: Duration = Duration::from_secs(8);

/// A device as last advertised. Every field is "what the player told us", so a
/// device that has not pushed a queue yet simply has an empty one.
#[derive(Clone, Default)]
pub struct DeviceState {
    pub id: String,
    pub name: String,
    pub now_playing: Option<RemoteNowPlaying>,
    pub status: Option<RemoteStatus>,
    pub queue: Vec<RemoteQueueItem>,
    pub queue_index: u32,
}

/// Where a command is addressed.
#[derive(Clone, Debug)]
pub enum Target {
    /// One device, by id.
    One(String),
    /// Every device on the account (the protocol's untargeted broadcast).
    All,
}

impl Target {
    fn id(&self) -> Option<String> {
        match self {
            Target::One(id) => Some(id.clone()),
            Target::All => None,
        }
    }

    pub fn describe(&self, player: &Player) -> String {
        match self {
            Target::One(id) => player
                .device(id)
                .map(|d| d.name)
                .unwrap_or_else(|| id.clone()),
            Target::All => "all devices".to_string(),
        }
    }
}

#[derive(Default)]
struct World {
    devices: HashMap<String, DeviceState>,
    primary: Option<String>,
}

pub struct Player {
    controller: RemoteController,
    world: Mutex<World>,
    /// The `--device` the server was started with: what a tool call that names
    /// no device falls back to before the one-device / primary rules.
    default_device: Option<String>,
    /// Flips true on the first `devices` snapshot, so the first tool call can
    /// wait for real state instead of reporting an empty account.
    seeded_tx: watch::Sender<bool>,
    seeded_rx: watch::Receiver<bool>,
}

impl Player {
    /// Connect as a controller and start folding events. The connection itself
    /// retries in the background, so this never fails — a tool call made while
    /// the socket is down reports "no devices" rather than erroring the server.
    pub fn connect(config: &Config, token: String) -> std::sync::Arc<Self> {
        let controller = RemoteController::connect(
            RemoteControllerConfig::new(token, "rocksky-mcp").url(config.ws_url.clone()),
        );
        let (seeded_tx, seeded_rx) = watch::channel(false);
        let player = std::sync::Arc::new(Player {
            controller,
            world: Mutex::new(World::default()),
            default_device: config.device.clone(),
            seeded_tx,
            seeded_rx,
        });
        tokio::spawn(pump(player.clone()));
        player
    }

    /// Wait for the initial device snapshot (bounded). Call before any read.
    pub async fn ready(&self) {
        if *self.seeded_rx.borrow() {
            return;
        }
        let mut rx = self.seeded_rx.clone();
        let _ = tokio::time::timeout(SEED_TIMEOUT, async move {
            while !*rx.borrow() {
                if rx.changed().await.is_err() {
                    return;
                }
            }
        })
        .await;
    }

    pub fn devices(&self) -> Vec<DeviceState> {
        let world = self.world.lock().unwrap();
        let mut devices: Vec<DeviceState> = world.devices.values().cloned().collect();
        devices.sort_by_key(|d| d.name.to_lowercase());
        devices
    }

    pub fn device(&self, id: &str) -> Option<DeviceState> {
        self.world.lock().unwrap().devices.get(id).cloned()
    }

    pub fn primary(&self) -> Option<String> {
        self.world.lock().unwrap().primary.clone()
    }

    /// Resolve the `device` tool argument to a command target.
    ///
    /// A missing argument is the common case — most accounts have exactly one
    /// player running — so it falls back to the only device, then to the
    /// primary one, and only errors when the choice is genuinely ambiguous.
    pub fn resolve(&self, arg: Option<&str>) -> Result<Target> {
        let devices = self.devices();
        let wanted = arg
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .or_else(|| self.default_device.clone())
            .filter(|s| !s.trim().is_empty());

        if let Some(wanted) = wanted {
            if wanted.eq_ignore_ascii_case("all") {
                return Ok(Target::All);
            }
            if let Some(d) = devices.iter().find(|d| d.id == wanted) {
                return Ok(Target::One(d.id.clone()));
            }
            let exact: Vec<&DeviceState> = devices
                .iter()
                .filter(|d| d.name.eq_ignore_ascii_case(&wanted))
                .collect();
            if exact.len() == 1 {
                return Ok(Target::One(exact[0].id.clone()));
            }
            let lower = wanted.to_lowercase();
            let partial: Vec<&DeviceState> = devices
                .iter()
                .filter(|d| d.name.to_lowercase().contains(&lower))
                .collect();
            match partial.len() {
                1 => return Ok(Target::One(partial[0].id.clone())),
                0 => bail!("no device matches {wanted:?}. {}", available(&devices)),
                _ => bail!(
                    "{wanted:?} matches several devices: {}",
                    partial
                        .iter()
                        .map(|d| d.name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            }
        }

        if devices.len() == 1 {
            return Ok(Target::One(devices[0].id.clone()));
        }
        if let Some(primary) = self.primary() {
            if devices.iter().any(|d| d.id == primary) {
                return Ok(Target::One(primary));
            }
        }
        if devices.is_empty() {
            bail!("no players are online. Run `rocksky` (or `playerd`, or open the Rocksky web/desktop app) on the machine that should play, and try again");
        }
        bail!(
            "several players are online — pass `device`. {}",
            available(&devices)
        )
    }

    // ── Commands ────────────────────────────────────────────────────────────
    //
    // All fire-and-forget: the protocol has no acks. Tools call `settle` and
    // then re-read the device's pushed state to report what actually happened.

    pub fn play(&self, t: &Target) {
        self.controller.play(t.id());
    }
    pub fn pause(&self, t: &Target) {
        self.controller.pause(t.id());
    }
    pub fn next(&self, t: &Target) {
        self.controller.next(t.id());
    }
    pub fn previous(&self, t: &Target) {
        self.controller.previous(t.id());
    }
    pub fn seek(&self, t: &Target, position_ms: u64) {
        self.controller.seek(t.id(), position_ms);
    }
    pub fn set_volume(&self, t: &Target, volume: f32) {
        self.controller.set_volume(t.id(), volume);
    }
    pub fn set_shuffle(&self, t: &Target, enabled: bool) {
        self.controller.set_shuffle(t.id(), enabled);
    }
    pub fn set_repeat(&self, t: &Target, mode: rocksky_sdk::RemoteRepeat) {
        self.controller.set_repeat(t.id(), mode);
    }
    pub fn queue_jump(&self, t: &Target, index: u32) {
        self.controller.queue_jump(t.id(), index);
    }
    pub fn queue_remove(&self, t: &Target, index: u32) {
        self.controller.queue_remove(t.id(), index);
    }
    pub fn queue_move(&self, t: &Target, from: u32, to: u32) {
        self.controller.queue_move(t.id(), from, to);
    }
    pub fn enqueue(
        &self,
        t: &Target,
        tracks: Vec<RemoteQueueItem>,
        mode: &str,
        shuffle: bool,
        start_index: u32,
    ) {
        self.controller
            .enqueue(t.id(), tracks, mode, shuffle, start_index);
    }
    pub fn set_audio_settings(&self, t: &Target, settings: &rocksky_sdk::RemoteAudioSettings) {
        self.controller.set_audio_settings(t.id(), settings);
    }
    pub fn set_primary(&self, device_id: &str) {
        self.controller.set_primary(device_id);
    }
}

fn available(devices: &[DeviceState]) -> String {
    if devices.is_empty() {
        return "No players are online.".to_string();
    }
    format!(
        "Online players: {}",
        devices
            .iter()
            .map(|d| format!("{} ({})", d.name, d.id))
            .collect::<Vec<_>>()
            .join(", ")
    )
}

/// Give a command time to reach the player and its state push to come back.
/// playerd re-pushes ~150 ms after applying a command; the rest is network.
pub async fn settle(ms: u64) {
    tokio::time::sleep(Duration::from_millis(ms)).await;
}

async fn pump(player: std::sync::Arc<Player>) {
    while let Some(event) = player.controller.next_event().await {
        let mut world = player.world.lock().unwrap();
        match event {
            RemoteEvent::Devices {
                primary_device,
                devices,
            } => {
                world.primary = primary_device;
                world.devices = devices
                    .into_iter()
                    .map(|d| {
                        let status = d.now_playing.as_ref().map(|np| {
                            if np.is_playing {
                                RemoteStatus::Playing
                            } else {
                                RemoteStatus::Paused
                            }
                        });
                        (
                            d.device_id.clone(),
                            DeviceState {
                                id: d.device_id,
                                name: d.name,
                                now_playing: d.now_playing,
                                status,
                                queue: d.queue,
                                queue_index: d.queue_index,
                            },
                        )
                    })
                    .collect();
                let _ = player.seeded_tx.send(true);
            }
            RemoteEvent::DeviceRegistered { device_id, name } => {
                let entry = world.devices.entry(device_id.clone()).or_default();
                entry.id = device_id;
                entry.name = name;
            }
            RemoteEvent::DeviceUnregistered { device_id } => {
                world.devices.remove(&device_id);
            }
            RemoteEvent::PrimaryChanged { device_id } => world.primary = Some(device_id),
            RemoteEvent::NowPlaying {
                device_id,
                device_name,
                track,
            } => {
                let entry = upsert(&mut world, &device_id, &device_name);
                entry.status = Some(if track.is_playing {
                    RemoteStatus::Playing
                } else {
                    RemoteStatus::Paused
                });
                entry.now_playing = Some(track);
            }
            RemoteEvent::Status {
                device_id,
                device_name,
                status,
            } => {
                upsert(&mut world, &device_id, &device_name).status = Some(status);
            }
            RemoteEvent::Queue {
                device_id,
                device_name,
                index,
                queue,
            } => {
                let entry = upsert(&mut world, &device_id, &device_name);
                entry.queue = queue;
                entry.queue_index = index;
            }
        }
    }
    tracing::warn!("remote controller event stream ended");
}

fn upsert<'a>(world: &'a mut World, device_id: &str, device_name: &str) -> &'a mut DeviceState {
    let entry = world.devices.entry(device_id.to_string()).or_default();
    entry.id = device_id.to_string();
    if !device_name.is_empty() {
        entry.name = device_name.to_string();
    }
    entry
}

// ── JSON views ──────────────────────────────────────────────────────────────

pub fn status_str(status: Option<RemoteStatus>) -> &'static str {
    match status {
        Some(RemoteStatus::Playing) => "playing",
        Some(RemoteStatus::Paused) => "paused",
        Some(RemoteStatus::Stopped) => "stopped",
        None => "unknown",
    }
}

pub fn now_playing_json(np: &RemoteNowPlaying) -> Value {
    let mut v = json!({
        "title": np.title,
        "artist": np.artist,
        "album": np.album,
        "isPlaying": np.is_playing,
        "elapsedMs": np.elapsed_ms,
        "durationMs": np.duration_ms,
        "position": format!("{} / {}", hms(np.elapsed_ms), hms(np.duration_ms)),
    });
    if !np.album_artist.is_empty() {
        v["albumArtist"] = json!(np.album_artist);
    }
    if !np.album_art.is_empty() {
        v["albumArt"] = json!(np.album_art);
    }
    if let Some(codec) = &np.codec {
        v["codec"] = json!(codec);
    }
    if let Some(rate) = np.sample_rate {
        v["sampleRate"] = json!(rate);
    }
    if let Some(shuffle) = np.shuffle {
        v["shuffle"] = json!(shuffle);
    }
    if let Some(repeat) = np.repeat {
        v["repeat"] = json!(repeat.as_wire());
    }
    if let Some(volume) = np.volume {
        v["volume"] = json!((volume * 100.0).round() / 100.0);
    }
    v
}

pub fn queue_item_json(index: usize, item: &RemoteQueueItem, current: bool) -> Value {
    let mut v = json!({
        "index": index,
        "title": item.title,
        "artist": item.artist,
        "album": item.album,
        "durationMs": item.duration_ms,
    });
    if current {
        v["current"] = json!(true);
    }
    if !item.track_id.is_empty() {
        v["id"] = json!(item.track_id);
    } else if !item.upload_id.is_empty() {
        v["id"] = json!(item.upload_id);
    }
    v
}

/// One device, with its now-playing. `queue` is summarised unless asked for in
/// full — a 300-track queue in every `list_devices` reply would drown the
/// caller in JSON it did not ask for.
pub fn device_json(device: &DeviceState, primary: bool, full_queue: bool) -> Value {
    let mut v = json!({
        "id": device.id,
        "name": device.name,
        "status": status_str(device.status),
        "isPrimary": primary,
        "queueLength": device.queue.len(),
        "queueIndex": device.queue_index,
    });
    if let Some(np) = &device.now_playing {
        v["nowPlaying"] = now_playing_json(np);
    }
    if full_queue {
        v["queue"] = json!(device
            .queue
            .iter()
            .enumerate()
            .map(|(i, item)| queue_item_json(i, item, i as u32 == device.queue_index))
            .collect::<Vec<_>>());
    }
    v
}

fn hms(ms: u64) -> String {
    let total = ms / 1000;
    let (h, m, s) = (total / 3600, (total % 3600) / 60, total % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}
