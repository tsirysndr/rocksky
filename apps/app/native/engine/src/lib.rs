//! Native playback engine for the Rocksky mobile app: rockbox-playback on a
//! dedicated thread (`Player` is `!Send`), driven by one JSON-over-JNI
//! command entrypoint.

use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use rockbox_playback::{Levels, PlaybackState, Player, PlayerConfig, RepeatMode, Status};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(
    tag = "cmd",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum Request {
    Open {
        paths: Vec<String>,
        #[serde(default)]
        start_index: usize,
    },
    Play,
    Pause,
    Next,
    Previous,
    Seek {
        position_ms: u64,
    },
    SkipTo {
        index: usize,
    },
    Append {
        paths: Vec<String>,
    },
    InsertNext {
        paths: Vec<String>,
    },
    Remove {
        index: usize,
    },
    SetVolume {
        volume: f32,
    },
    SetShuffle {
        enabled: bool,
    },
    SetRepeat {
        mode: String,
    },
    Stop,
    Status,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusResponse {
    ok: bool,
    state: &'static str,
    index: Option<usize>,
    position_ms: u64,
    duration_ms: u64,
    queue_len: usize,
    shuffle: bool,
    repeat: &'static str,
    volume: f32,
}

#[derive(Serialize)]
struct OkResponse {
    ok: bool,
}

#[derive(Serialize)]
struct ErrResponse {
    ok: bool,
    error: String,
}

fn err(message: impl Into<String>) -> String {
    serde_json::to_string(&ErrResponse {
        ok: false,
        error: message.into(),
    })
    .unwrap_or_else(|_| r#"{"ok":false,"error":"serialize"}"#.to_string())
}

fn ok() -> String {
    serde_json::to_string(&OkResponse { ok: true }).unwrap()
}

enum EngineCmd {
    Open {
        paths: Vec<String>,
        start_index: usize,
    },
    Play,
    Pause,
    Next,
    Previous,
    Seek(Duration),
    SkipTo(usize),
    Append(Vec<String>),
    InsertNext(Vec<String>),
    Remove(usize),
    SetVolume(f32),
    SetShuffle(bool),
    SetRepeat(RepeatMode),
    Stop,
    GetSnapshot(Sender<Snapshot>),
}

#[derive(Clone)]
struct Snapshot {
    status: Status,
    volume: f32,
    taken: Instant,
}

impl Default for Snapshot {
    fn default() -> Self {
        Snapshot {
            status: Status {
                state: PlaybackState::Stopped,
                index: None,
                position: Duration::ZERO,
                duration: Duration::ZERO,
                metadata: None,
                queue_len: 0,
                shuffle: false,
                repeat: RepeatMode::Off,
                levels: Levels::default(),
            },
            volume: 1.0,
            taken: Instant::now(),
        }
    }
}

struct Engine {
    tx: Mutex<Sender<EngineCmd>>,
    snapshot: Arc<Mutex<Snapshot>>,
}

impl Engine {
    fn start(config: PlayerConfig) -> Result<Self, String> {
        let (tx, rx) = channel::<EngineCmd>();
        let (ready_tx, ready_rx) = channel::<Result<(), String>>();
        let snapshot: Arc<Mutex<Snapshot>> = Arc::new(Mutex::new(Snapshot::default()));
        let shared = snapshot.clone();

        std::thread::Builder::new()
            .name("rocksky-engine".into())
            .spawn(move || {
                let player = match Player::with_config(config) {
                    Ok(p) => {
                        let _ = ready_tx.send(Ok(()));
                        p
                    }
                    Err(e) => {
                        let _ = ready_tx.send(Err(format!("audio engine: {e:?}")));
                        return;
                    }
                };
                loop {
                    match rx.recv_timeout(Duration::from_millis(250)) {
                        Ok(EngineCmd::GetSnapshot(reply)) => {
                            let _ = reply.send(snapshot_of(&player));
                        }
                        Ok(cmd) => apply(&player, cmd),
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                    *shared.lock().unwrap() = snapshot_of(&player);
                }
            })
            .map_err(|e| e.to_string())?;

        ready_rx
            .recv()
            .map_err(|_| "engine thread died during startup".to_string())??;

        Ok(Engine {
            tx: Mutex::new(tx),
            snapshot,
        })
    }

    fn send(&self, cmd: EngineCmd) {
        let _ = self.tx.lock().unwrap().send(cmd);
    }

    /// Live read on the engine thread; the cached snapshot (extrapolated to
    /// read time) is the fallback when the thread is busy for >100ms.
    fn snapshot(&self) -> Snapshot {
        let (reply_tx, reply_rx) = channel();
        if self
            .tx
            .lock()
            .unwrap()
            .send(EngineCmd::GetSnapshot(reply_tx))
            .is_ok()
        {
            if let Ok(snap) = reply_rx.recv_timeout(Duration::from_millis(100)) {
                return snap;
            }
        }
        let mut snap = self.snapshot.lock().unwrap().clone();
        if snap.status.state == PlaybackState::Playing {
            let pos = snap.status.position + snap.taken.elapsed();
            snap.status.position = if snap.status.duration > Duration::ZERO {
                pos.min(snap.status.duration)
            } else {
                pos
            };
        }
        snap
    }
}

fn snapshot_of(player: &Player) -> Snapshot {
    Snapshot {
        status: player.status(),
        volume: player.volume(),
        taken: Instant::now(),
    }
}

fn apply(player: &Player, cmd: EngineCmd) {
    match cmd {
        EngineCmd::Open { paths, start_index } => {
            player.set_queue(paths.iter().map(String::as_str));
            if start_index > 0 {
                player.skip_to(start_index);
            }
            player.play();
        }
        EngineCmd::Play => player.play(),
        EngineCmd::Pause => player.pause(),
        EngineCmd::Next => player.next(),
        EngineCmd::Previous => player.previous(),
        EngineCmd::Seek(pos) => player.seek(pos),
        EngineCmd::SkipTo(index) => player.skip_to(index),
        EngineCmd::Append(paths) => player.insert_tracks_last(paths.iter().map(String::as_str)),
        EngineCmd::InsertNext(paths) => player.insert_tracks_next(paths.iter().map(String::as_str)),
        EngineCmd::Remove(index) => player.remove(index),
        EngineCmd::SetVolume(volume) => player.set_volume(volume.clamp(0.0, 1.0)),
        EngineCmd::SetShuffle(enabled) => player.set_shuffle(enabled),
        EngineCmd::SetRepeat(mode) => player.set_repeat(mode),
        EngineCmd::Stop => {
            player.pause();
            player.set_queue(std::iter::empty::<&str>());
        }
        EngineCmd::GetSnapshot(_) => {}
    }
}

static ENGINE: OnceLock<Result<Engine, String>> = OnceLock::new();

fn engine() -> Result<&'static Engine, String> {
    ENGINE
        .get_or_init(|| Engine::start(PlayerConfig::default()))
        .as_ref()
        .map_err(Clone::clone)
}

fn state_name(state: PlaybackState) -> &'static str {
    match state {
        PlaybackState::Playing => "playing",
        PlaybackState::Paused => "paused",
        PlaybackState::Stopped => "stopped",
    }
}

fn repeat_name(mode: RepeatMode) -> &'static str {
    match mode {
        RepeatMode::Off => "off",
        RepeatMode::One => "one",
        RepeatMode::All => "all",
    }
}

fn parse_repeat(mode: &str) -> RepeatMode {
    match mode {
        "one" => RepeatMode::One,
        "all" => RepeatMode::All,
        _ => RepeatMode::Off,
    }
}

/// Dispatch one JSON command and return the JSON response.
pub fn handle(input: &str) -> String {
    let request: Request = match serde_json::from_str(input) {
        Ok(r) => r,
        Err(e) => return err(format!("bad command: {e}")),
    };
    let engine = match engine() {
        Ok(e) => e,
        Err(e) => return err(e),
    };
    match request {
        Request::Status => {
            let snap = engine.snapshot();
            serde_json::to_string(&StatusResponse {
                ok: true,
                state: state_name(snap.status.state),
                index: snap.status.index,
                position_ms: snap.status.position.as_millis() as u64,
                duration_ms: snap.status.duration.as_millis() as u64,
                queue_len: snap.status.queue_len,
                shuffle: snap.status.shuffle,
                repeat: repeat_name(snap.status.repeat),
                volume: snap.volume,
            })
            .unwrap_or_else(|e| err(e.to_string()))
        }
        Request::Open { paths, start_index } => {
            engine.send(EngineCmd::Open { paths, start_index });
            ok()
        }
        Request::Play => {
            engine.send(EngineCmd::Play);
            ok()
        }
        Request::Pause => {
            engine.send(EngineCmd::Pause);
            ok()
        }
        Request::Next => {
            engine.send(EngineCmd::Next);
            ok()
        }
        Request::Previous => {
            engine.send(EngineCmd::Previous);
            ok()
        }
        Request::Seek { position_ms } => {
            engine.send(EngineCmd::Seek(Duration::from_millis(position_ms)));
            ok()
        }
        Request::SkipTo { index } => {
            engine.send(EngineCmd::SkipTo(index));
            ok()
        }
        Request::Append { paths } => {
            engine.send(EngineCmd::Append(paths));
            ok()
        }
        Request::InsertNext { paths } => {
            engine.send(EngineCmd::InsertNext(paths));
            ok()
        }
        Request::Remove { index } => {
            engine.send(EngineCmd::Remove(index));
            ok()
        }
        Request::SetVolume { volume } => {
            engine.send(EngineCmd::SetVolume(volume));
            ok()
        }
        Request::SetShuffle { enabled } => {
            engine.send(EngineCmd::SetShuffle(enabled));
            ok()
        }
        Request::SetRepeat { mode } => {
            engine.send(EngineCmd::SetRepeat(parse_repeat(&mode)));
            ok()
        }
        Request::Stop => {
            engine.send(EngineCmd::Stop);
            ok()
        }
    }
}

#[cfg(target_os = "android")]
mod android {
    use std::sync::OnceLock;

    use jni::objects::{JClass, JObject, JString};
    use jni::sys::jstring;
    use jni::JNIEnv;

    /// Hands the JavaVM + application context to `ndk-context` — cpal's oboe
    /// backend needs it, and plain `System.loadLibrary` leaves it unset.
    #[no_mangle]
    pub extern "system" fn Java_expo_modules_rockskyengine_NativeEngine_nativeInit(
        env: JNIEnv,
        _class: JClass,
        context: JObject,
    ) {
        static INIT: OnceLock<()> = OnceLock::new();
        INIT.get_or_init(|| {
            if let (Ok(vm), Ok(global)) = (env.get_java_vm(), env.new_global_ref(&context)) {
                unsafe {
                    ndk_context::initialize_android_context(
                        vm.get_java_vm_pointer() as *mut _,
                        global.as_obj().as_raw() as *mut _,
                    );
                }
                // The context global ref must outlive the process.
                std::mem::forget(global);
            }
        });
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_rockskyengine_NativeEngine_command<'local>(
        mut env: JNIEnv<'local>,
        _class: JClass<'local>,
        json: JString<'local>,
    ) -> jstring {
        let input: String = match env.get_string(&json) {
            Ok(s) => s.into(),
            Err(_) => String::new(),
        };
        let output = super::handle(&input);
        match env.new_string(output) {
            Ok(s) => s.into_raw(),
            Err(_) => std::ptr::null_mut(),
        }
    }
}
