//! Native playback engine for the Rocksky mobile app: rockbox-playback on a
//! dedicated thread (`Player` is `!Send`), driven by one JSON-over-JNI
//! command entrypoint.

mod audio;
mod fingerprint;
mod metadata;
mod remote_metadata;

use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use rockbox_playback::{Levels, PlaybackState, Player, PlayerConfig, RepeatMode, Status};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(tag = "cmd", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum Request {
    RendererConfigure {
        config: Option<rocksky_renderer::Config>,
    },
    RendererStatus,
    RendererRelease,
    ReadRemoteMetadata {
        url: String,
        cache_path: String,
        art_path: String,
    },
    CacheRemoteArtwork {
        url: String,
        path: String,
    },
    WriteUploadMetadata {
        path: String,
        metadata: serde_json::Value,
        art_path: Option<String>,
    },
    Fingerprint {
        path: String,
    },
    ReadMetadata {
        path: String,
        art_path: String,
    },
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
    SetAudioSettings {
        settings: serde_json::Value,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    renderer_track: Option<rocksky_renderer::Track>,
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
    SetAudioSettings(serde_json::Value),
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
                let mut audio = audio::AudioSettings::default();
                let mut shuffle = false;
                loop {
                    match rx.recv_timeout(Duration::from_millis(250)) {
                        Ok(EngineCmd::GetSnapshot(reply)) => {
                            let _ = reply.send(snapshot_of(&player));
                        }
                        Ok(cmd) => apply(&player, cmd, &mut audio, &mut shuffle),
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

fn apply(player: &Player, cmd: EngineCmd, audio: &mut audio::AudioSettings, shuffle: &mut bool) {
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
        EngineCmd::SetShuffle(enabled) => {
            *shuffle = enabled;
            player.set_shuffle(enabled);
            audio.apply(player, enabled);
        }
        EngineCmd::SetAudioSettings(settings) => {
            audio.merge(settings);
            audio.apply(player, *shuffle);
        }
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
static RENDERER: Mutex<Option<rocksky_renderer::Renderer>> = Mutex::new(None);

pub fn handle(input: &str) -> String {
    handle_internal(input, false)
}

fn handle_internal(input: &str, from_renderer: bool) -> String {
    let request: Request = match serde_json::from_str(input) {
        Ok(r) => r,
        Err(e) => return err(format!("bad command: {e}")),
    };
    if let Request::RendererConfigure { config } = &request {
        let previous = {
            let mut renderer = RENDERER.lock().unwrap();
            if let Some(previous) = renderer.as_ref() {
                previous.cancel();
            }
            renderer.take()
        };
        // Slow controller sockets must not block synchronous JS status reads.
        if let Some(previous) = previous {
            previous.stop();
        }
        if let Some(config) = config {
            let backend: rocksky_renderer::Backend = Arc::new(|command| {
                #[cfg(target_os = "android")]
                if matches!(command["cmd"].as_str(), Some("open" | "play"))
                    && !android::renderer_focus()
                {
                    return serde_json::json!({"ok":false,"error":"Audio focus unavailable"});
                }
                serde_json::from_str(&handle_internal(&command.to_string(), true))
                    .unwrap_or(serde_json::json!({"ok":false}))
            });
            match rocksky_renderer::Renderer::start(config.clone(), backend) {
                Ok(started) => *RENDERER.lock().unwrap() = Some(started),
                Err(error) => return err(error),
            }
        }
        return ok();
    }
    if let Request::RendererRelease = &request {
        if let Some(renderer) = RENDERER.lock().unwrap().as_ref() {
            if renderer.track().is_some() {
                if let Ok(engine) = engine() {
                    engine.send(EngineCmd::Stop);
                }
            }
            renderer.release();
        }
        return ok();
    }
    if let Request::RendererStatus = &request {
        let renderer = RENDERER.lock().unwrap();
        return serde_json::json!({"ok":true,"running":renderer.is_some(),"location":renderer.as_ref().map(|r| &r.location),"track":renderer.as_ref().and_then(|r|r.track())}).to_string();
    }
    if !from_renderer
        && matches!(
            request,
            Request::Open { .. }
                | Request::Append { .. }
                | Request::InsertNext { .. }
                | Request::Remove { .. }
                | Request::SkipTo { .. }
                | Request::Next
                | Request::Previous
                | Request::Stop
        )
    {
        if let Some(renderer) = RENDERER.lock().unwrap().as_ref() {
            renderer.release();
        }
    }
    if let Request::ReadRemoteMetadata {
        url,
        cache_path,
        art_path,
    } = &request
    {
        return match remote_metadata::read(
            url,
            std::path::Path::new(cache_path),
            std::path::Path::new(art_path),
        ) {
            Ok(metadata) => serde_json::json!({"ok":true,"metadata":metadata}).to_string(),
            Err(e) => err(e),
        };
    }
    if let Request::CacheRemoteArtwork { url, path } = &request {
        return match remote_metadata::artwork(url, std::path::Path::new(path)) {
            Ok(()) => ok(),
            Err(e) => err(e),
        };
    }
    if let Request::WriteUploadMetadata {
        path,
        metadata,
        art_path,
    } = &request
    {
        return match metadata::write_upload(
            std::path::Path::new(path),
            metadata,
            art_path.as_deref().map(std::path::Path::new),
        ) {
            Ok(()) => ok(),
            Err(e) => err(e),
        };
    }
    if let Request::Fingerprint { path } = &request {
        return match fingerprint::read(std::path::Path::new(path)) {
            Ok(value) => serde_json::json!({"ok":true,"fingerprint":value}).to_string(),
            Err(e) => err(e),
        };
    }
    if let Request::ReadMetadata { path, art_path } = &request {
        return match metadata::read(std::path::Path::new(path), std::path::Path::new(art_path)) {
            Ok(metadata) => serde_json::json!({"ok":true,"metadata":metadata}).to_string(),
            Err(e) => err(e),
        };
    }
    let engine = match engine() {
        Ok(e) => e,
        Err(e) => return err(e),
    };
    match request {
        Request::RendererConfigure { .. }
        | Request::RendererRelease
        | Request::RendererStatus
        | Request::ReadRemoteMetadata { .. }
        | Request::CacheRemoteArtwork { .. }
        | Request::ReadMetadata { .. }
        | Request::Fingerprint { .. }
        | Request::WriteUploadMetadata { .. } => unreachable!(),
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
                renderer_track: if from_renderer {
                    None
                } else {
                    RENDERER.lock().unwrap().as_ref().and_then(|r| r.track())
                },
            })
            .unwrap_or_else(|e| err(e.to_string()))
        }
        Request::Open { paths, start_index } => {
            engine.send(EngineCmd::Open { paths, start_index });
            ok()
        }
        Request::Play => {
            #[cfg(target_os = "android")]
            if !from_renderer
                && RENDERER
                    .lock()
                    .unwrap()
                    .as_ref()
                    .and_then(|r| r.track())
                    .is_some()
                && !android::renderer_focus()
            {
                return err("Audio focus unavailable");
            }
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
            if !from_renderer {
                if let Some(renderer) = RENDERER.lock().unwrap().as_ref() {
                    renderer.local_volume(volume);
                }
            }
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
        Request::SetAudioSettings { settings } => {
            engine.send(EngineCmd::SetAudioSettings(settings));
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

    static JAVA: OnceLock<(jni::JavaVM, jni::objects::GlobalRef)> = OnceLock::new();
    pub(super) fn renderer_focus() -> bool {
        let Some((vm, class)) = JAVA.get() else {
            return false;
        };
        let Ok(mut env) = vm.attach_current_thread() else {
            return false;
        };
        let class: &JClass = class.as_obj().into();
        match env.call_static_method(class, "rendererFocus", "()Z", &[]) {
            Ok(value) => value.z().unwrap_or(false),
            Err(_) => {
                let _ = env.exception_clear();
                false
            }
        }
    }

    /// Hands the JavaVM + application context to `ndk-context` — cpal's oboe
    /// backend needs it, and plain `System.loadLibrary` leaves it unset.
    #[no_mangle]
    pub extern "system" fn Java_expo_modules_rockskyengine_NativeEngine_nativeInit(
        env: JNIEnv,
        class: JClass,
        context: JObject,
    ) {
        if let (Ok(vm), Ok(class)) = (env.get_java_vm(), env.new_global_ref(class)) {
            let _ = JAVA.set((vm, class));
        }
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
    pub extern "system" fn Java_expo_modules_rockskyengine_NativeEngine_libraryCommand<'local>(
        mut env: JNIEnv<'local>,
        _class: JClass<'local>,
        json: JString<'local>,
    ) -> jstring {
        let input: String = env.get_string(&json).map(|s| s.into()).unwrap_or_default();
        let output = rocksky_libraries::handle(&input);
        env.new_string(output)
            .map(|s| s.into_raw())
            .unwrap_or(std::ptr::null_mut())
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
