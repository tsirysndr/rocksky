//! Thread confinement for the playback engine.
//!
//! `rockbox_playback::Player` owns the cpal output stream and is `!Send`, so
//! it lives on a dedicated thread. `Engine` is the `Send + Sync` handle the
//! rest of the daemon holds: commands go over a channel, and the thread
//! refreshes a shared status snapshot after every command and on a 250 ms
//! tick.

use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rockbox_playback::{
    ChannelMode, CrossfadeSettings, Equalizer, PlaybackState, Player, PlayerConfig, RepeatMode,
    ReplayGainMode, Status, ToneControls,
};

pub enum EngineCmd {
    /// Replace the queue and start playback at `start_index` ("play now").
    OpenAt {
        paths: Vec<String>,
        start_index: usize,
        shuffle: bool,
    },
    Append(Vec<String>),
    InsertNext(Vec<String>),
    Play,
    Pause,
    Next,
    Previous,
    Seek(Duration),
    SkipTo(usize),
    Remove(usize),
    SetEqualizer(Equalizer),
    SetTone(ToneControls),
    SetBalance(i32),
    SetChannelMode(ChannelMode),
    SetCrossfade(CrossfadeSettings),
    SetReplaygain {
        mode: ReplayGainMode,
        preamp_db: f32,
        noclip: bool,
    },
}

/// A `Send + Clone` snapshot of the engine, refreshed by the engine thread.
#[derive(Clone)]
pub struct Snapshot {
    pub status: Status,
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
            },
        }
    }
}

pub struct Engine {
    tx: Mutex<Sender<EngineCmd>>,
    snapshot: Arc<Mutex<Snapshot>>,
}

impl Engine {
    /// Spawn the engine thread. Fails when the output backend is unusable.
    pub fn start(config: PlayerConfig) -> Result<Self, String> {
        let (tx, rx) = channel::<EngineCmd>();
        let (ready_tx, ready_rx) = channel::<Result<(), String>>();
        let snapshot: Arc<Mutex<Snapshot>> = Arc::new(Mutex::new(Snapshot::default()));
        let shared = snapshot.clone();

        std::thread::Builder::new()
            .name("rockbox-engine".into())
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
                        Ok(cmd) => apply(&player, cmd),
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                    *shared.lock().unwrap() = Snapshot {
                        status: player.status(),
                    };
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

    pub fn send(&self, cmd: EngineCmd) {
        let _ = self.tx.lock().unwrap().send(cmd);
    }

    pub fn snapshot(&self) -> Snapshot {
        self.snapshot.lock().unwrap().clone()
    }
}

fn apply(player: &Player, cmd: EngineCmd) {
    match cmd {
        EngineCmd::OpenAt {
            paths,
            start_index,
            shuffle,
        } => {
            tracing::debug!(
                count = paths.len(),
                start_index,
                first = paths.first().map(String::as_str),
                "engine: open"
            );
            player.set_queue(paths.iter().map(String::as_str));
            player.set_shuffle(shuffle);
            if start_index > 0 {
                player.skip_to(start_index);
            }
            player.play();
        }
        EngineCmd::Append(paths) => player.insert_tracks_last(paths.iter().map(String::as_str)),
        EngineCmd::InsertNext(paths) => player.insert_tracks_next(paths.iter().map(String::as_str)),
        EngineCmd::Play => player.play(),
        EngineCmd::Pause => player.pause(),
        EngineCmd::Next => player.next(),
        EngineCmd::Previous => player.previous(),
        EngineCmd::Seek(pos) => player.seek(pos),
        EngineCmd::SkipTo(index) => player.skip_to(index),
        EngineCmd::Remove(index) => player.remove(index),
        EngineCmd::SetEqualizer(equalizer) => player.set_equalizer(equalizer),
        EngineCmd::SetTone(tone) => player.set_tone(tone),
        EngineCmd::SetBalance(balance) => player.set_balance(balance),
        EngineCmd::SetChannelMode(mode) => player.set_channel_mode(mode),
        EngineCmd::SetCrossfade(settings) => player.set_crossfade(settings),
        EngineCmd::SetReplaygain {
            mode,
            preamp_db,
            noclip,
        } => player.set_replaygain(mode, preamp_db, noclip),
    }
}
