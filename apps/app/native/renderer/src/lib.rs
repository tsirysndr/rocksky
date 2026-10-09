//! Opt-in UPnP audio renderer. Android owns the network/foreground lifecycle;
//! this crate owns SSDP, SOAP and GENA. No account or cloud service is involved.
mod network;
mod protocol;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::net::Ipv4Addr;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread::JoinHandle;

pub type Backend = Arc<dyn Fn(Value) -> Value + Send + Sync>;
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub ip: Ipv4Addr,
    pub prefix_length: u8,
    pub name: String,
    pub uuid: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub uri: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art: Option<String>,
    pub duration_ms: u64,
    pub generation: u64,
}
#[derive(Default)]
struct State {
    track: Option<Track>,
    metadata: String,
    loaded: bool,
    generation: u64,
    muted: bool,
    volume: f64,
}
impl State {
    fn uri(&self) -> &str {
        self.track.as_ref().map_or("", |t| &t.uri)
    }
    fn transport(&self, status: &Value) -> &'static str {
        if self.track.is_none() {
            "NO_MEDIA_PRESENT"
        } else if !self.loaded {
            "STOPPED"
        } else {
            match status["state"].as_str() {
                Some("playing") => "PLAYING",
                Some("paused") => "PAUSED_PLAYBACK",
                _ => "STOPPED",
            }
        }
    }
}
struct Shared {
    state: Mutex<State>,
    backend: Backend,
    stop: AtomicBool,
}
impl Shared {
    fn stopped(&self) -> bool {
        self.stop.load(Ordering::Acquire)
    }
}
pub struct Renderer {
    shared: Arc<Shared>,
    threads: Vec<JoinHandle<()>>,
    pub location: String,
}
impl Renderer {
    pub fn start(config: Config, backend: Backend) -> Result<Self, String> {
        if config.prefix_length > 32
            || config.ip.is_unspecified()
            || config.ip.is_multicast()
            || config.name.is_empty()
            || config.name.len() > 200
            || config.uuid.len() != 36
            || !config
                .uuid
                .chars()
                .all(|c| c.is_ascii_hexdigit() || c == '-')
        {
            return Err("Invalid renderer network configuration".into());
        }
        let shared = Arc::new(Shared {
            state: Mutex::new(State {
                volume: 1.0,
                ..Default::default()
            }),
            backend,
            stop: AtomicBool::new(false),
        });
        let (threads, location) =
            network::start(config, shared.clone()).map_err(|e| e.to_string())?;
        Ok(Self {
            shared,
            threads,
            location,
        })
    }
    /// Local playback takes ownership without disabling discovery. Never expose
    /// an unrelated local queue as the controller's selected transport URI.
    pub fn release(&self) {
        let mut state = self.shared.state.lock().unwrap();
        if state.muted {
            (self.shared.backend)(json!({"cmd":"setVolume","volume":state.volume}));
        }
        state.muted = false;
        state.track = None;
        state.metadata.clear();
        state.loaded = false;
    }
    pub fn local_volume(&self, volume: f32) {
        let mut state = self.shared.state.lock().unwrap();
        state.volume = volume.clamp(0.0, 1.0) as f64;
        state.muted = false;
    }
    pub fn track(&self) -> Option<Track> {
        let state = self.shared.state.lock().unwrap();
        if state.loaded {
            state.track.clone()
        } else {
            None
        }
    }
    pub fn stop(mut self) {
        self.shutdown();
    }
    /// Stop accepting controls and surrender audio before the owner drops its
    /// handle. Joining network workers can then happen off the UI status lock.
    pub fn cancel(&self) {
        if self.shared.stop.swap(true, Ordering::AcqRel) {
            return;
        }
        let mut state = self.shared.state.lock().unwrap();
        if state.loaded {
            (self.shared.backend)(json!({"cmd":"stop"}));
        }
        if state.muted {
            (self.shared.backend)(json!({"cmd":"setVolume","volume":state.volume}));
        }
        state.track = None;
        state.loaded = false;
    }
    fn shutdown(&mut self) {
        self.cancel();
        for thread in self.threads.drain(..) {
            let _ = thread.join();
        }
    }
}
impl Drop for Renderer {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(test)]
mod tests;
