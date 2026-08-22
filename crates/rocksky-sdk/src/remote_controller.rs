//! Build a Rocksky remote controller.
//!
//! [`RemoteController`] is the other half of the remote-control WebSocket
//! protocol (see `remote-ws/PROTOCOL.md`): where [`RemotePlayer`](crate::RemotePlayer)
//! is a controllable player, a controller is the remote UI — it lists the user's
//! players, shows what each is playing (now-playing / status / queue), selects
//! the primary device, and sends commands (play / pause / next / previous / seek
//! / queue actions / enqueue). Heartbeat, reconnect, and the device-id handshake
//! are handled for you.
//!
//! **Poll model.** Incoming updates are delivered through [`RemoteController::next_event`]
//! rather than callbacks — the host drives a simple loop. This keeps the API
//! identical across every FFI binding (UniFFI, C-ABI, NIF), none of which need a
//! callback-into-foreign-code path.
//!
//! ```no_run
//! # use rocksky_sdk::remote_controller::{RemoteController, RemoteControllerConfig, RemoteEvent};
//! # async fn ex() {
//! let controller = RemoteController::connect(RemoteControllerConfig::new("<token>", "My Controller"));
//! while let Some(event) = controller.next_event().await {
//!     match event {
//!         RemoteEvent::Devices { devices, .. } => { /* render the picker */ let _ = devices; }
//!         RemoteEvent::NowPlaying { device_id, track, .. } => {
//!             controller.play(Some(device_id)); // e.g. resume that device
//!             let _ = track;
//!         }
//!         _ => {}
//!     }
//! }
//! # }
//! ```
//!
//! Gated behind the `remote-player` feature.

use std::time::Duration;

use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::{mpsc, watch, Mutex};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use crate::remote_player::{RemoteNowPlaying, RemoteQueueItem, RemoteStatus, DEFAULT_REMOTE_WS};

const HEARTBEAT: Duration = Duration::from_secs(10);
const RECONNECT: Duration = Duration::from_secs(3);

/// Configuration for [`RemoteController::connect`].
#[derive(Clone, Debug)]
pub struct RemoteControllerConfig {
    /// Rocksky access token (a JWT — from `rocksky login` or an access token).
    pub token: String,
    /// Registration label. Controllers are hidden from device lists, so this is
    /// mostly for the server's logs.
    pub name: String,
    /// WebSocket endpoint. Defaults to [`DEFAULT_REMOTE_WS`].
    pub url: String,
}

impl RemoteControllerConfig {
    /// Config with the default endpoint.
    pub fn new(token: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            token: token.into(),
            name: name.into(),
            url: DEFAULT_REMOTE_WS.to_string(),
        }
    }

    /// Override the endpoint (builder-style).
    pub fn url(mut self, url: impl Into<String>) -> Self {
        self.url = url.into();
        self
    }
}

/// A player device visible to the controller (from the `devices` snapshot).
#[derive(Clone, Debug, Default)]
pub struct RemoteDevice {
    pub device_id: String,
    pub name: String,
    /// The device's current track, if it has advertised one.
    pub now_playing: Option<RemoteNowPlaying>,
    /// Active index within [`queue`](Self::queue).
    pub queue_index: u32,
    pub queue: Vec<RemoteQueueItem>,
}

/// An update pushed to the controller by the server.
#[derive(Clone, Debug)]
pub enum RemoteEvent {
    /// The full device snapshot (sent right after (re)register).
    Devices {
        primary_device: Option<String>,
        devices: Vec<RemoteDevice>,
    },
    /// A device joined.
    DeviceRegistered { device_id: String, name: String },
    /// A device left.
    DeviceUnregistered { device_id: String },
    /// The primary (scrobble/profile) device changed.
    PrimaryChanged { device_id: String },
    /// A device advertised a new track.
    NowPlaying {
        device_id: String,
        device_name: String,
        track: RemoteNowPlaying,
    },
    /// A device advertised a transport-state change.
    Status {
        device_id: String,
        device_name: String,
        status: RemoteStatus,
    },
    /// A device advertised its queue.
    Queue {
        device_id: String,
        device_name: String,
        index: u32,
        queue: Vec<RemoteQueueItem>,
    },
}

// Outbound frames carried from the handle to the background task, which stamps
// them with the token before sending.
enum CtlOut {
    SetPrimary(String),
    Command {
        action: String,
        target: Option<String>,
        args: Option<Value>,
    },
}

/// A remote controller. Cheap to hold; the connection runs in a background task
/// on the current tokio runtime until this handle is dropped (or
/// [`disconnect`](RemoteController::disconnect) is called).
pub struct RemoteController {
    out_tx: mpsc::UnboundedSender<CtlOut>,
    event_rx: Mutex<mpsc::UnboundedReceiver<RemoteEvent>>,
    stop_tx: watch::Sender<bool>,
}

impl RemoteController {
    /// Connect, register, and maintain the session (heartbeat + auto-reconnect)
    /// in a background task. Must be called from within a tokio runtime.
    pub fn connect(config: RemoteControllerConfig) -> Self {
        let (out_tx, out_rx) = mpsc::unbounded_channel();
        let (event_tx, event_rx) = mpsc::unbounded_channel();
        let (stop_tx, stop_rx) = watch::channel(false);

        tokio::spawn(background(config, out_rx, event_tx, stop_rx));

        Self {
            out_tx,
            event_rx: Mutex::new(event_rx),
            stop_tx,
        }
    }

    /// Await the next update from the server. Returns `None` once the controller
    /// is disconnected (handle dropped or [`disconnect`](Self::disconnect) called).
    pub async fn next_event(&self) -> Option<RemoteEvent> {
        self.event_rx.lock().await.recv().await
    }

    /// Choose the primary (scrobble/profile) device.
    pub fn set_primary(&self, device_id: impl Into<String>) {
        let _ = self.out_tx.send(CtlOut::SetPrimary(device_id.into()));
    }

    /// Send a `play` command. `target` = a device id, or `None` to broadcast to
    /// all the user's devices.
    pub fn play(&self, target: Option<String>) {
        self.command("play", target, None);
    }

    /// Send a `pause` command.
    pub fn pause(&self, target: Option<String>) {
        self.command("pause", target, None);
    }

    /// Send a `next` command.
    pub fn next(&self, target: Option<String>) {
        self.command("next", target, None);
    }

    /// Send a `previous` command.
    pub fn previous(&self, target: Option<String>) {
        self.command("previous", target, None);
    }

    /// Seek the target device to `position_ms`.
    pub fn seek(&self, target: Option<String>, position_ms: u64) {
        self.command("seek", target, Some(json!({ "position": position_ms })));
    }

    /// Jump to `index` in the target device's queue.
    pub fn queue_jump(&self, target: Option<String>, index: u32) {
        self.command("queue_jump", target, Some(json!({ "index": index })));
    }

    /// Remove queue item `index` on the target device.
    pub fn queue_remove(&self, target: Option<String>, index: u32) {
        self.command("queue_remove", target, Some(json!({ "index": index })));
    }

    /// Enqueue tracks on the target device. `mode` is `"now"` | `"next"` |
    /// `"last"`; `start_index` is the entry to start at when `mode == "now"`.
    pub fn enqueue(
        &self,
        target: Option<String>,
        tracks: Vec<RemoteQueueItem>,
        mode: impl Into<String>,
        shuffle: bool,
        start_index: u32,
    ) {
        let args = json!({
            "tracks": tracks.iter().map(descriptor_json).collect::<Vec<_>>(),
            "mode": mode.into(),
            "shuffle": shuffle,
            "startIndex": start_index,
        });
        self.command("enqueue", target, Some(args));
    }

    /// Send an arbitrary command (escape hatch).
    pub fn command(&self, action: impl Into<String>, target: Option<String>, args: Option<Value>) {
        let _ = self.out_tx.send(CtlOut::Command {
            action: action.into(),
            target,
            args,
        });
    }

    /// Stop the connection and end [`next_event`](Self::next_event).
    pub fn disconnect(&self) {
        let _ = self.stop_tx.send(true);
    }
}

impl Drop for RemoteController {
    fn drop(&mut self) {
        let _ = self.stop_tx.send(true);
    }
}

// ── Background task ───────────────────────────────────────────────────────────

async fn background(
    config: RemoteControllerConfig,
    mut out_rx: mpsc::UnboundedReceiver<CtlOut>,
    event_tx: mpsc::UnboundedSender<RemoteEvent>,
    mut stop_rx: watch::Receiver<bool>,
) {
    loop {
        if *stop_rx.borrow() {
            return;
        }

        tokio::select! {
            _ = stop_rx.changed() => return,
            _ = session(&config, &mut out_rx, &event_tx) => {}
        }

        tokio::select! {
            _ = stop_rx.changed() => return,
            _ = tokio::time::sleep(RECONNECT) => {}
        }
    }
}

/// One connect → register → read/write session. Returns when the socket drops
/// (so the caller reconnects). The server re-sends the `devices` snapshot on
/// re-register, so no local resync is needed.
async fn session(
    config: &RemoteControllerConfig,
    out_rx: &mut mpsc::UnboundedReceiver<CtlOut>,
    event_tx: &mpsc::UnboundedSender<RemoteEvent>,
) {
    let (ws, _) = match connect_async(&config.url).await {
        Ok(ok) => ok,
        Err(e) => {
            tracing::warn!(error = %e, "remote-controller connect failed");
            return;
        }
    };
    tracing::info!(url = %config.url, "remote-controller connected");
    let (mut write, mut read) = ws.split();

    // Register (controllers register too; they're hidden from device lists).
    let register = json!({ "type": "register", "clientName": config.name, "token": config.token });
    if write
        .send(Message::Text(register.to_string().into()))
        .await
        .is_err()
    {
        return;
    }

    let mut heartbeat = tokio::time::interval(HEARTBEAT);
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            // Outbound command / set_primary from the host.
            msg = out_rx.recv() => {
                let Some(msg) = msg else { return; }; // handle dropped
                if send_out(&mut write, config, &msg).await.is_err() {
                    return;
                }
            }

            // Inbound frame from the server.
            frame = read.next() => {
                match frame {
                    Some(Ok(Message::Text(text))) => {
                        for event in parse_events(text.as_str()) {
                            if event_tx.send(event).is_err() {
                                return; // receiver gone
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => return,
                    Some(Err(e)) => {
                        tracing::warn!(error = %e, "remote-controller read error");
                        return;
                    }
                    Some(Ok(_)) => {} // ping/pong/binary
                }
            }

            // Heartbeat.
            _ = heartbeat.tick() => {
                if write.send(Message::Text("ping".to_string().into())).await.is_err() {
                    return;
                }
            }
        }
    }
}

async fn send_out<S>(write: &mut S, config: &RemoteControllerConfig, msg: &CtlOut) -> Result<(), ()>
where
    S: SinkExt<Message> + Unpin,
{
    let frame = match msg {
        CtlOut::SetPrimary(id) => json!({
            "type": "set_primary",
            "device_id": id,
            "token": config.token,
        }),
        CtlOut::Command {
            action,
            target,
            args,
        } => {
            let mut o = json!({ "type": "command", "action": action, "token": config.token });
            if let Some(t) = target {
                o["target"] = json!(t);
            }
            if let Some(a) = args {
                o["args"] = a.clone();
            }
            o
        }
    };
    write
        .send(Message::Text(frame.to_string().into()))
        .await
        .map_err(|_| ())
}

// ── Inbound parsing ───────────────────────────────────────────────────────────

/// Parse a server frame into zero or more [`RemoteEvent`]s.
fn parse_events(text: &str) -> Vec<RemoteEvent> {
    if text == "pong" {
        return Vec::new();
    }
    let Ok(v) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    // The registration reply carries no event (we don't need our own id to
    // control other devices).
    if v.get("status").and_then(|x| x.as_str()) == Some("registered") {
        return Vec::new();
    }
    let ty = v.get("type").and_then(|x| x.as_str()).unwrap_or("");
    match ty {
        "devices" => vec![RemoteEvent::Devices {
            primary_device: v
                .get("primary_device")
                .and_then(|x| x.as_str())
                .map(str::to_string),
            devices: v
                .get("devices")
                .and_then(|x| x.as_array())
                .map(|a| a.iter().map(device_from_value).collect())
                .unwrap_or_default(),
        }],
        "device_registered" => vec![RemoteEvent::DeviceRegistered {
            device_id: str_field(&v, "deviceId"),
            name: str_field(&v, "clientName"),
        }],
        "device_unregistered" => vec![RemoteEvent::DeviceUnregistered {
            device_id: str_field(&v, "device_id"),
        }],
        "primary_changed" => vec![RemoteEvent::PrimaryChanged {
            device_id: str_field(&v, "device_id"),
        }],
        "message" => message_event(&v).into_iter().collect(),
        _ => Vec::new(),
    }
}

/// A `message` broadcast wraps a device's `track` / `status` / `queue` state.
fn message_event(v: &Value) -> Option<RemoteEvent> {
    let device_id = str_field(v, "device_id");
    let device_name = str_field(v, "device_name");
    let data = v.get("data")?;
    match data.get("type").and_then(|x| x.as_str())? {
        "track" => Some(RemoteEvent::NowPlaying {
            device_id,
            device_name,
            track: track_from_value(data),
        }),
        "status" => Some(RemoteEvent::Status {
            device_id,
            device_name,
            status: status_from_code(data.get("status").and_then(|x| x.as_i64()).unwrap_or(0)),
        }),
        "queue" => Some(RemoteEvent::Queue {
            device_id,
            device_name,
            index: data.get("index").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
            queue: data
                .get("queue")
                .and_then(|x| x.as_array())
                .map(|a| a.iter().map(queue_item_from_value).collect())
                .unwrap_or_default(),
        }),
        _ => None,
    }
}

fn device_from_value(v: &Value) -> RemoteDevice {
    let now_playing = v
        .get("now_playing")
        .filter(|x| x.is_object())
        .map(track_from_value);
    let (queue_index, queue) = v
        .get("queue")
        .map(|q| {
            (
                q.get("index").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
                q.get("queue")
                    .and_then(|x| x.as_array())
                    .map(|a| a.iter().map(queue_item_from_value).collect())
                    .unwrap_or_default(),
            )
        })
        .unwrap_or((0, Vec::new()));
    RemoteDevice {
        device_id: str_field(v, "device_id"),
        name: str_field(v, "name"),
        now_playing,
        queue_index,
        queue,
    }
}

fn track_from_value(v: &Value) -> RemoteNowPlaying {
    RemoteNowPlaying {
        title: str_field(v, "title"),
        artist: str_field(v, "artist"),
        album: str_field(v, "album"),
        album_artist: str_field(v, "album_artist"),
        album_art: str_field(v, "album_art"),
        duration_ms: v
            .get("duration_ms")
            .and_then(|x| x.as_u64())
            .or_else(|| v.get("length").and_then(|x| x.as_u64()))
            .unwrap_or(0),
        elapsed_ms: v.get("elapsed").and_then(|x| x.as_u64()).unwrap_or(0),
        is_playing: v
            .get("is_playing")
            .and_then(|x| x.as_bool())
            .unwrap_or(false),
        codec: v.get("codec").and_then(|x| x.as_str()).map(str::to_string),
        sample_rate: v
            .get("sample_rate")
            .and_then(|x| x.as_u64())
            .map(|n| n as u32),
    }
}

fn queue_item_from_value(v: &Value) -> RemoteQueueItem {
    RemoteQueueItem {
        upload_id: str_field(v, "uploadId"),
        track_id: str_field(v, "trackId"),
        title: str_field(v, "title"),
        artist: str_field(v, "artist"),
        album: str_field(v, "album"),
        album_artist: str_field(v, "album_artist"),
        album_art: str_field(v, "album_art"),
        duration_ms: v.get("duration").and_then(|x| x.as_u64()).unwrap_or(0),
        song_uri: str_field(v, "song_uri"),
        album_uri: str_field(v, "album_uri"),
        track_number: v.get("track_number").and_then(|x| x.as_i64()).unwrap_or(0) as i32,
    }
}

/// An `enqueue` descriptor the controller sends to a player.
fn descriptor_json(t: &RemoteQueueItem) -> Value {
    json!({
        "uploadId": t.upload_id,
        "trackId": t.track_id,
        "title": t.title,
        "artist": t.artist,
        "album": t.album,
        "album_artist": t.album_artist,
        "album_art": t.album_art,
        "duration": t.duration_ms,
        "song_uri": t.song_uri,
        "album_uri": t.album_uri,
        "track_number": t.track_number,
    })
}

fn status_from_code(code: i64) -> RemoteStatus {
    match code {
        1 => RemoteStatus::Playing,
        0 => RemoteStatus::Stopped,
        _ => RemoteStatus::Paused, // 2 or 3
    }
}

fn str_field(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string()
}
