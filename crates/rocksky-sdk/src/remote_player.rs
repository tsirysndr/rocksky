//! Build a Rocksky-controllable player.
//!
//! [`RemotePlayer`] speaks the remote-control WebSocket protocol (see
//! `remote-ws/PROTOCOL.md`): it registers as a device, advertises what you're
//! playing (now-playing / status / queue), and surfaces the commands a
//! miniplayer sends (play / pause / next / previous / seek / enqueue / queue
//! actions). Heartbeat, reconnect, and the device-id handshake are handled for
//! you.
//!
//! **Poll model.** Incoming commands are delivered through [`RemotePlayer::next_command`]
//! rather than callbacks — the host drives a simple loop. This keeps the API
//! identical across every FFI binding (UniFFI, C-ABI, NIF), none of which need a
//! callback-into-foreign-code path.
//!
//! ```no_run
//! # use rocksky_sdk::remote_player::{RemotePlayer, RemotePlayerConfig, RemoteCommand, RemoteNowPlaying};
//! # async fn ex() {
//! let player = RemotePlayer::connect(RemotePlayerConfig::new("<token>", "My Player"));
//! player.set_now_playing(RemoteNowPlaying { title: "Song".into(), artist: "Artist".into(), is_playing: true, ..Default::default() });
//! while let Some(cmd) = player.next_command().await {
//!     match cmd {
//!         RemoteCommand::Play => { /* engine.play() */ }
//!         RemoteCommand::Pause => { /* engine.pause() */ }
//!         RemoteCommand::Seek { position_ms } => { let _ = position_ms; }
//!         _ => {}
//!     }
//! }
//! # }
//! ```
//!
//! Gated behind the `remote-player` feature.

use std::time::Duration;

use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;

use crate::remote_audio::{RemoteAudioSettings, RemoteRepeat};
use tokio::sync::{mpsc, watch, Mutex};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

/// Default remote-control WebSocket endpoint.
pub const DEFAULT_REMOTE_WS: &str = "wss://api.rocksky.app/ws";

const HEARTBEAT: Duration = Duration::from_secs(10);
const RECONNECT: Duration = Duration::from_secs(3);

/// Configuration for [`RemotePlayer::connect`].
#[derive(Clone, Debug)]
pub struct RemotePlayerConfig {
    /// Rocksky access token (a JWT — from `rocksky login` or an access token).
    pub token: String,
    /// Display name shown in the miniplayer device picker.
    pub name: String,
    /// WebSocket endpoint. Defaults to [`DEFAULT_REMOTE_WS`].
    pub url: String,
}

impl RemotePlayerConfig {
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

/// Now-playing state a player advertises.
#[derive(Clone, Debug, Default)]
pub struct RemoteNowPlaying {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub album_art: String,
    /// Total track length, ms.
    pub duration_ms: u64,
    /// Current position, ms.
    pub elapsed_ms: u64,
    pub is_playing: bool,
    /// Audio codec / container of the playing file (e.g. "mp3", "flac"), when
    /// the player knows it. Shown as a format badge by controller UIs.
    pub codec: Option<String>,
    /// Audio sample rate in Hz (e.g. 44100), when the player knows it.
    pub sample_rate: Option<u32>,
    /// Queue shuffle state. `None` from a player that has no shuffle, which is
    /// how a controller knows to hide the toggle rather than show it wrong.
    pub shuffle: Option<bool>,
    /// Queue repeat mode. `None` when the player has none.
    pub repeat: Option<RemoteRepeat>,
    /// Output volume 0.0..=1.0. `None` when the player has no volume control.
    pub volume: Option<f32>,
}

/// Transport state.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RemoteStatus {
    Playing,
    Paused,
    Stopped,
}

impl RemoteStatus {
    fn code(self) -> i32 {
        match self {
            RemoteStatus::Playing => 1,
            RemoteStatus::Paused => 2,
            RemoteStatus::Stopped => 0,
        }
    }
}

/// One queue entry. Provide `upload_id` (Rocksky uploads) or `track_id`
/// (Navidrome/Subsonic id) so the item can be streamed.
#[derive(Clone, Debug, Default)]
pub struct RemoteQueueItem {
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

/// A command from a controller for this player to execute.
#[derive(Clone, Debug)]
pub enum RemoteCommand {
    Play,
    Pause,
    Next,
    Previous,
    Seek {
        position_ms: u64,
    },
    QueueJump {
        index: u32,
    },
    QueueRemove {
        index: u32,
    },
    Enqueue {
        tracks: Vec<RemoteQueueItem>,
        /// "now" | "next" | "last".
        mode: String,
        shuffle: bool,
        start_index: u32,
    },
    /// Turn queue shuffle on or off.
    SetShuffle {
        enabled: bool,
    },
    /// Set the queue repeat mode.
    SetRepeat {
        mode: RemoteRepeat,
    },
    /// Set output volume, 0.0..=1.0.
    SetVolume {
        volume: f32,
    },
    /// Apply a partial audio-settings document. Sections the player's engine
    /// does not implement are simply not read — see [`RemoteAudioSettings`].
    SetAudioSettings(Box<RemoteAudioSettings>),
}

// Outbound state pushes carried from the handle to the background task, which
// frames them with the (post-register) device_id + token before sending.
enum OutMsg {
    Track(RemoteNowPlaying),
    Status(i32),
    Queue(Vec<RemoteQueueItem>, u32),
}

/// A controllable player. Cheap to hold; the connection runs in a background
/// task on the current tokio runtime until this handle is dropped (or
/// [`disconnect`](RemotePlayer::disconnect) is called).
pub struct RemotePlayer {
    out_tx: mpsc::UnboundedSender<OutMsg>,
    cmd_rx: Mutex<mpsc::UnboundedReceiver<RemoteCommand>>,
    stop_tx: watch::Sender<bool>,
    device_id: std::sync::Arc<std::sync::Mutex<Option<String>>>,
}

impl RemotePlayer {
    /// Connect, register, and maintain the session (heartbeat + auto-reconnect)
    /// in a background task. Must be called from within a tokio runtime.
    pub fn connect(config: RemotePlayerConfig) -> Self {
        let (out_tx, out_rx) = mpsc::unbounded_channel();
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
        let (stop_tx, stop_rx) = watch::channel(false);
        let device_id = std::sync::Arc::new(std::sync::Mutex::new(None));

        tokio::spawn(background(
            config,
            out_rx,
            cmd_tx,
            stop_rx,
            device_id.clone(),
        ));

        Self {
            out_tx,
            cmd_rx: Mutex::new(cmd_rx),
            stop_tx,
            device_id,
        }
    }

    /// The device id the server assigned at registration — `None` until the
    /// `registered` ack arrives (and again briefly after a reconnect). Useful
    /// for a client that both registers a player and lists devices, so it can
    /// recognize (e.g. hide) itself.
    pub fn device_id(&self) -> Option<String> {
        self.device_id.lock().unwrap().clone()
    }

    /// Await the next command from a controller. Returns `None` once the player
    /// is disconnected (handle dropped or [`disconnect`](Self::disconnect) called).
    pub async fn next_command(&self) -> Option<RemoteCommand> {
        self.cmd_rx.lock().await.recv().await
    }

    /// Advertise the current track. Call on change and periodically (~every 1–4s)
    /// with a fresh `elapsed_ms` so controllers show smooth progress.
    pub fn set_now_playing(&self, np: RemoteNowPlaying) {
        let _ = self.out_tx.send(OutMsg::Track(np));
    }

    /// Advertise transport state.
    pub fn set_status(&self, status: RemoteStatus) {
        let _ = self.out_tx.send(OutMsg::Status(status.code()));
    }

    /// Advertise the playback queue + current index.
    pub fn set_queue(&self, items: Vec<RemoteQueueItem>, index: u32) {
        let _ = self.out_tx.send(OutMsg::Queue(items, index));
    }

    /// Stop the connection and end [`next_command`](Self::next_command).
    pub fn disconnect(&self) {
        let _ = self.stop_tx.send(true);
    }
}

impl Drop for RemotePlayer {
    fn drop(&mut self) {
        let _ = self.stop_tx.send(true);
    }
}

// ── Background task ───────────────────────────────────────────────────────────

async fn background(
    config: RemotePlayerConfig,
    mut out_rx: mpsc::UnboundedReceiver<OutMsg>,
    cmd_tx: mpsc::UnboundedSender<RemoteCommand>,
    mut stop_rx: watch::Receiver<bool>,
    shared_device_id: std::sync::Arc<std::sync::Mutex<Option<String>>>,
) {
    // Last state, re-advertised after every (re)connect so controllers resync.
    let mut last = LastState::default();

    loop {
        if *stop_rx.borrow() {
            return;
        }

        tokio::select! {
            _ = stop_rx.changed() => return,
            _ = session(&config, &mut out_rx, &cmd_tx, &mut last, &shared_device_id) => {}
        }

        // Reconnect backoff (cancellable).
        tokio::select! {
            _ = stop_rx.changed() => return,
            _ = tokio::time::sleep(RECONNECT) => {}
        }
    }
}

#[derive(Default)]
struct LastState {
    track: Option<RemoteNowPlaying>,
    status: Option<i32>,
    queue: Option<(Vec<RemoteQueueItem>, u32)>,
}

/// One connect → register → read/write session. Returns when the socket drops
/// (so the caller reconnects). Outbound sends during a gap queue in `out_rx`.
async fn session(
    config: &RemotePlayerConfig,
    out_rx: &mut mpsc::UnboundedReceiver<OutMsg>,
    cmd_tx: &mpsc::UnboundedSender<RemoteCommand>,
    last: &mut LastState,
    shared_device_id: &std::sync::Mutex<Option<String>>,
) {
    let (ws, _) = match connect_async(&config.url).await {
        Ok(ok) => ok,
        Err(e) => {
            tracing::warn!(error = %e, "remote-player connect failed");
            return;
        }
    };
    tracing::info!(url = %config.url, "remote-player connected");
    let (mut write, mut read) = ws.split();

    // Register.
    let register = json!({ "type": "register", "clientName": config.name, "token": config.token });
    if write
        .send(Message::Text(register.to_string().into()))
        .await
        .is_err()
    {
        return;
    }

    let mut device_id = String::new();
    let mut heartbeat = tokio::time::interval(HEARTBEAT);
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            // Outbound state push from the host.
            msg = out_rx.recv() => {
                let Some(msg) = msg else { return; }; // handle dropped
                remember(last, &msg);
                if send_out(&mut write, config, &device_id, &msg).await.is_err() {
                    return;
                }
            }

            // Inbound frame from the server.
            frame = read.next() => {
                match frame {
                    Some(Ok(Message::Text(text))) => {
                        match handle_frame(text.as_str(), cmd_tx) {
                            Frame::Registered(id) => {
                                device_id = id;
                                *shared_device_id.lock().unwrap() = Some(device_id.clone());
                                // Re-advertise last state on (re)register.
                                if let Some(t) = &last.track {
                                    let _ = send_out(&mut write, config, &device_id, &OutMsg::Track(t.clone())).await;
                                }
                                if let Some(s) = last.status {
                                    let _ = send_out(&mut write, config, &device_id, &OutMsg::Status(s)).await;
                                }
                                if let Some((q, i)) = &last.queue {
                                    let _ = send_out(&mut write, config, &device_id, &OutMsg::Queue(q.clone(), *i)).await;
                                }
                            }
                            Frame::Other => {}
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => return,
                    Some(Err(e)) => {
                        tracing::warn!(error = %e, "remote-player read error");
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

fn remember(last: &mut LastState, msg: &OutMsg) {
    match msg {
        OutMsg::Track(t) => last.track = Some(t.clone()),
        OutMsg::Status(s) => last.status = Some(*s),
        OutMsg::Queue(q, i) => last.queue = Some((q.clone(), *i)),
    }
}

async fn send_out<S>(
    write: &mut S,
    config: &RemotePlayerConfig,
    device_id: &str,
    msg: &OutMsg,
) -> Result<(), ()>
where
    S: SinkExt<Message> + Unpin,
{
    let data = match msg {
        OutMsg::Track(t) => {
            let mut data = json!({
                "type": "track",
                "title": t.title,
                "artist": t.artist,
                "album": t.album,
                "album_artist": if t.album_artist.is_empty() { &t.artist } else { &t.album_artist },
                "length": t.duration_ms,
                "elapsed": t.elapsed_ms,
                "duration_ms": t.duration_ms,
                "album_art": t.album_art,
                "is_playing": t.is_playing,
                "device_name": config.name,
            });
            if let Some(codec) = &t.codec {
                data["codec"] = json!(codec);
            }
            if let Some(sample_rate) = t.sample_rate {
                data["sample_rate"] = json!(sample_rate);
            }
            // Omitted, not defaulted: a controller must be able to tell "this
            // player has no shuffle" from "shuffle is off".
            if let Some(shuffle) = t.shuffle {
                data["shuffle"] = json!(shuffle);
            }
            if let Some(repeat) = t.repeat {
                data["repeat"] = json!(repeat.as_wire());
            }
            if let Some(volume) = t.volume {
                data["volume"] = json!(volume);
            }
            data
        }
        OutMsg::Status(s) => json!({ "type": "status", "status": s }),
        OutMsg::Queue(items, index) => json!({
            "type": "queue",
            "index": index,
            "queue": items.iter().map(queue_item_json).collect::<Vec<_>>(),
        }),
    };
    let frame = json!({
        "type": "message",
        "device_id": device_id,
        "token": config.token,
        "data": data,
    });
    write
        .send(Message::Text(frame.to_string().into()))
        .await
        .map_err(|_| ())
}

fn queue_item_json(t: &RemoteQueueItem) -> serde_json::Value {
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

enum Frame {
    Registered(String),
    Other,
}

fn handle_frame(text: &str, cmd_tx: &mpsc::UnboundedSender<RemoteCommand>) -> Frame {
    if text == "pong" {
        return Frame::Other;
    }
    let Ok(msg) = serde_json::from_str::<Inbound>(text) else {
        return Frame::Other;
    };
    // Capture our device id ONLY from the registration reply — never from a
    // `device_registered` broadcast (which carries another device's id).
    if msg.status.as_deref() == Some("registered") {
        if let Some(id) = msg.device_id {
            return Frame::Registered(id);
        }
    }
    if msg.r#type.as_deref() == Some("command") {
        if let Some(cmd) = parse_command(&msg) {
            let _ = cmd_tx.send(cmd);
        }
    }
    Frame::Other
}

fn parse_command(msg: &Inbound) -> Option<RemoteCommand> {
    let action = msg.action.as_deref()?;
    let args = msg.args.clone().unwrap_or(serde_json::Value::Null);
    Some(match action {
        "play" => RemoteCommand::Play,
        "pause" => RemoteCommand::Pause,
        "next" => RemoteCommand::Next,
        "previous" => RemoteCommand::Previous,
        "seek" => RemoteCommand::Seek {
            position_ms: args
                .get("position")
                .and_then(|v| v.as_u64())
                .or_else(|| args.as_u64())
                .unwrap_or(0),
        },
        "queue_jump" => RemoteCommand::QueueJump {
            index: args.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        },
        "queue_remove" => RemoteCommand::QueueRemove {
            index: args.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        },
        "enqueue" => {
            let tracks = args
                .get("tracks")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().map(descriptor_to_item).collect())
                .unwrap_or_default();
            RemoteCommand::Enqueue {
                tracks,
                mode: args
                    .get("mode")
                    .and_then(|v| v.as_str())
                    .unwrap_or("now")
                    .to_string(),
                shuffle: args
                    .get("shuffle")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
                start_index: args.get("startIndex").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            }
        }
        "shuffle" => RemoteCommand::SetShuffle {
            enabled: args
                .get("enabled")
                .and_then(|v| v.as_bool())
                .or_else(|| args.as_bool())
                .unwrap_or(false),
        },
        "repeat" => RemoteCommand::SetRepeat {
            mode: RemoteRepeat::from_wire(
                args.get("mode")
                    .and_then(|v| v.as_str())
                    .or_else(|| args.as_str())
                    .unwrap_or("off"),
            ),
        },
        "volume" => RemoteCommand::SetVolume {
            volume: args
                .get("volume")
                .and_then(|v| v.as_f64())
                .or_else(|| args.as_f64())
                .unwrap_or(1.0)
                .clamp(0.0, 1.0) as f32,
        },
        // A document that fails to parse, or carries only sections this build
        // has never heard of, is dropped rather than delivered empty — the host
        // should not be woken to apply nothing.
        "audio_settings" => {
            let settings: RemoteAudioSettings = serde_json::from_value(args).ok()?;
            if settings.is_empty() {
                return None;
            }
            RemoteCommand::SetAudioSettings(Box::new(settings))
        }
        _ => return None,
    })
}

fn descriptor_to_item(v: &serde_json::Value) -> RemoteQueueItem {
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
    RemoteQueueItem {
        upload_id: s("uploadId"),
        track_id: s("trackId"),
        title: s("title"),
        artist: s("artist"),
        album: s("album"),
        album_artist: s("album_artist"),
        album_art: s("album_art"),
        duration_ms: v.get("duration").and_then(|x| x.as_u64()).unwrap_or(0),
        song_uri: s("song_uri"),
        album_uri: s("album_uri"),
        track_number: v.get("track_number").and_then(|x| x.as_i64()).unwrap_or(0) as i32,
    }
}

#[derive(Deserialize)]
struct Inbound {
    #[serde(default)]
    r#type: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default, rename = "deviceId")]
    device_id: Option<String>,
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    args: Option<serde_json::Value>,
}
