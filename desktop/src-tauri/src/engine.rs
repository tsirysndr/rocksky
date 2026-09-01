//! Thread confinement for the playback engine.
//!
//! `rockbox_playback::Player` owns the cpal output stream and is `!Send`, so
//! it lives on a dedicated thread. `Engine` is the `Send + Sync` handle Tauri
//! state can hold: commands go over a channel, and the thread refreshes a
//! shared status snapshot after every command and on a 250 ms tick.

use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rockbox_playback::{EqBand, InsertPosition, PlaybackState, Player, RepeatMode, Status};

use crate::dsp::{self, CompressorOpts, CrossfadeOpts, DspState, SurroundOpts};

pub enum EngineCmd {
    Open(Vec<String>),
    /// Replace the queue; optionally cue only (wasm `setQueue(urls, autoplay)`).
    SetQueue {
        paths: Vec<String>,
        autoplay: bool,
    },
    /// Replace the queue and start playback at `start_index` ("play now").
    OpenAt {
        paths: Vec<String>,
        start_index: usize,
        shuffle: bool,
    },
    Append(Vec<String>),
    InsertNext(Vec<String>),
    /// Insert with a raw rockbox insertion-mode code (wasm InsertMode ints
    /// 0–7) and an explicit index for mode 7 (AtIndex).
    Insert {
        paths: Vec<String>,
        mode: u8,
        index: usize,
    },
    Toggle,
    Play,
    Pause,
    Stop,
    Next,
    Previous,
    Seek(Duration),
    SkipTo(usize),
    Remove(usize),
    ClearQueue,
    SetVolume(f32),
    SetShuffle(bool),
    SetRepeat(RepeatMode),
    /// Stereo balance, -100 (full left) ..= 100 (full right).
    SetBalance(i32),
    // ── DSP (wasm RockboxPlayer parity) ─────────────────────────────────────
    SetEqEnabled(bool),
    SetEqBand {
        band: usize,
        cutoff_hz: i32,
        q: f32,
        gain_db: f32,
    },
    SetEqPrecut(f32),
    SetTone {
        bass_db: i32,
        treble_db: i32,
    },
    SetToneCutoffs {
        bass_hz: i32,
        treble_hz: i32,
    },
    SetCrossfade {
        mode: u8,
        opts: CrossfadeOpts,
    },
    SetChannelMode(u8),
    SetStereoWidth(i32),
    SetReplaygain {
        mode: u8,
        noclip: bool,
        preamp_db: f32,
    },
    SetCrossfeed {
        mode: u8,
        direct_gain: i32,
        cross_gain: i32,
        high_freq_gain: i32,
        hf_cutoff: i32,
    },
    SetPbe {
        strength: i32,
        precut: i32,
    },
    SetCompressor(CompressorOpts),
    SetSurround(SurroundOpts),
    /// Reply with a snapshot taken NOW, on the engine thread — the live read
    /// path behind [`Engine::snapshot`].
    GetSnapshot(Sender<Snapshot>),
}

/// A `Send + Clone` snapshot of the engine, refreshed by the engine thread.
#[derive(Clone)]
pub struct Snapshot {
    pub status: Status,
    pub volume: f32,
    /// The queue's URLs/paths, verbatim — the frontend shim keys track
    /// metadata by exact queue string (like rockbox-wasm's queue events).
    pub queue: Vec<String>,
    /// When `status` was captured, so [`Engine::snapshot`] can extrapolate the
    /// position to read time.
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
            },
            volume: 1.0,
            queue: Vec::new(),
            taken: Instant::now(),
        }
    }
}

pub struct Engine {
    tx: Mutex<Sender<EngineCmd>>,
    snapshot: Arc<Mutex<Snapshot>>,
}

impl Engine {
    /// Spawn the engine thread. Fails when no audio output device is usable.
    pub fn start() -> Result<Self, String> {
        let (tx, rx) = channel::<EngineCmd>();
        let (ready_tx, ready_rx) = channel::<Result<(), String>>();
        let snapshot: Arc<Mutex<Snapshot>> = Arc::new(Mutex::new(Snapshot::default()));
        let shared = snapshot.clone();

        std::thread::Builder::new()
            .name("rockbox-engine".into())
            .spawn(move || {
                // Deep decode-ahead: at a track boundary the engine opens
                // the next source (an HTTPS probe + header fetch for remote
                // tracks) while the ring buffer keeps draining — the default
                // 4 s cushion audibly cuts out on slow opens; 10 s doesn't.
                let config = rockbox_playback::PlayerConfig::builder()
                    .buffer_seconds(10.0)
                    .build();
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
                let mut dsp = DspState::default();
                let mut smoother = BoundarySmoother::default();
                loop {
                    match rx.recv_timeout(Duration::from_millis(250)) {
                        Ok(EngineCmd::GetSnapshot(reply)) => {
                            let _ = reply.send(snapshot_of(&player, &mut smoother));
                        }
                        Ok(cmd) => {
                            if intentional_jump(&cmd) {
                                smoother.expect_jump = true;
                            }
                            apply(&player, &mut dsp, cmd);
                        }
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                    *shared.lock().unwrap() = snapshot_of(&player, &mut smoother);
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

    /// The engine state, read LIVE on the engine thread — no cache.
    ///
    /// `Player` is `!Send` (it owns the audio stream), so consumers can't call
    /// `status()` themselves; a round-trip to the engine thread gets a snapshot
    /// computed at read time. Reading the shared cache instead made every value
    /// 0–250ms stale, and the staleness swept as the timers drifted — measured
    /// as 500ms polls advancing by anywhere from 261 to 522ms (see
    /// examples/position_probe.rs), the miniplayer's unstable clock.
    ///
    /// The cache survives only as a fallback for when the engine thread cannot
    /// answer within 100ms, extrapolated by the wall time since capture so even
    /// the fallback ticks evenly.
    pub fn snapshot(&self) -> Snapshot {
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

/// A snapshot computed right now. Runs on the engine thread only.
fn snapshot_of(player: &Player, smoother: &mut BoundarySmoother) -> Snapshot {
    Snapshot {
        status: smoother.filter(player.status()),
        volume: player.volume(),
        queue: player
            .queue()
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect(),
        taken: Instant::now(),
    }
}

/// Smooths over the playback crate's decode-side track flip.
///
/// `Player::status()` reports the DECODER's track. With a deep decode-ahead
/// buffer the index, duration and position all flip to the next track
/// ~buffer_seconds before the current one audibly ends, and the position
/// collapses to zero — measured: a 15s track "flipped" at wall 5.0s with the
/// 10s buffer (see the desktop crate's examples/boundary_probe.rs). Read raw,
/// every track change made the clock jump back several seconds, seconds early.
///
/// So until the audible track has run its duration out, keep reporting it:
/// same index, same duration, position projected on the wall clock from the
/// last pre-flip sample. Release at the old duration — the real boundary,
/// where the raw position is ≈0 again and correct. Deliberate jumps (seek,
/// skip, queue edits) are flagged by the command loop and pass through.
#[derive(Default)]
struct BoundarySmoother {
    /// The next discontinuity is intentional (a transport/queue command).
    expect_jump: bool,
    last: Option<LastSample>,
    hold: Option<Hold>,
}

struct LastSample {
    index: Option<usize>,
    position: Duration,
    at: Instant,
    duration: Duration,
}

struct Hold {
    index: Option<usize>,
    duration: Duration,
    position: Duration,
    since: Instant,
}

impl BoundarySmoother {
    fn filter(&mut self, mut status: Status) -> Status {
        let now = Instant::now();
        let playing = status.state == PlaybackState::Playing;

        if status.state == PlaybackState::Stopped {
            self.last = None;
            self.hold = None;
            self.expect_jump = false;
            return status;
        }
        if self.expect_jump {
            self.expect_jump = false;
            self.hold = None;
            self.remember(&status, now);
            return status;
        }

        if let Some(hold) = self.hold.as_mut() {
            if playing {
                hold.position += now - hold.since;
            }
            hold.since = now;
            // The engine caught back up on the held track (a decode hiccup,
            // not a flip) — believe it again.
            let caught_up = status.index == hold.index
                && status.position + Duration::from_millis(1000) >= hold.position;
            // The audible track has run out; from here the raw status (≈0 into
            // the next track) is the truth.
            let ended = hold.position + Duration::from_millis(150) >= hold.duration;
            if caught_up || ended {
                self.hold = None;
                self.remember(&status, now);
                return status;
            }
            status.index = hold.index;
            status.position = hold.position.min(hold.duration);
            status.duration = hold.duration;
            self.remember(&status, now);
            return status;
        }

        if let Some(last) = &self.last {
            let projected = if playing {
                last.position + (now - last.at)
            } else {
                last.position
            };
            let dropped = status.position + Duration::from_millis(1000) < projected;
            if playing && dropped && last.duration > Duration::ZERO {
                let position = projected.min(last.duration);
                self.hold = Some(Hold {
                    index: last.index,
                    duration: last.duration,
                    position,
                    since: now,
                });
                status.index = self.hold.as_ref().unwrap().index;
                status.position = position;
                status.duration = self.hold.as_ref().unwrap().duration;
                self.remember(&status, now);
                return status;
            }
        }
        self.remember(&status, now);
        status
    }

    fn remember(&mut self, status: &Status, at: Instant) {
        self.last = Some(LastSample {
            index: status.index,
            position: status.position,
            at,
            duration: status.duration,
        });
    }
}

/// Commands after which a position/index discontinuity is the user's own doing
/// and must pass through the smoother untouched.
fn intentional_jump(cmd: &EngineCmd) -> bool {
    matches!(
        cmd,
        EngineCmd::Seek(_)
            | EngineCmd::SkipTo(_)
            | EngineCmd::Next
            | EngineCmd::Previous
            | EngineCmd::Open(_)
            | EngineCmd::SetQueue { .. }
            | EngineCmd::OpenAt { .. }
            | EngineCmd::Remove(_)
            | EngineCmd::ClearQueue
            | EngineCmd::Stop
    )
}

fn insert_position(mode: u8, index: usize) -> InsertPosition {
    match mode {
        0 => InsertPosition::Prepend,
        1 => InsertPosition::Insert,
        2 => InsertPosition::InsertNext,
        4 => InsertPosition::InsertShuffled,
        5 => InsertPosition::InsertLastShuffled,
        6 => InsertPosition::Replace,
        7 => InsertPosition::Index(index),
        _ => InsertPosition::InsertLast,
    }
}

fn apply(player: &Player, dsp: &mut DspState, cmd: EngineCmd) {
    match cmd {
        EngineCmd::Open(paths) => {
            tracing::debug!(
                count = paths.len(),
                first = paths.first().map(String::as_str),
                "engine: open"
            );
            player.set_queue(paths.iter().map(String::as_str));
            player.play();
        }
        EngineCmd::SetQueue { paths, autoplay } => {
            tracing::debug!(
                count = paths.len(),
                autoplay,
                first = paths.first().map(String::as_str),
                "engine: set_queue"
            );
            player.set_queue(paths.iter().map(String::as_str));
            if autoplay {
                player.play();
            }
        }
        EngineCmd::OpenAt {
            paths,
            start_index,
            shuffle,
        } => {
            player.set_queue(paths.iter().map(String::as_str));
            player.set_shuffle(shuffle);
            if start_index > 0 {
                player.skip_to(start_index);
            }
            player.play();
        }
        EngineCmd::Append(paths) => player.insert_tracks_last(paths.iter().map(String::as_str)),
        EngineCmd::InsertNext(paths) => player.insert_tracks_next(paths.iter().map(String::as_str)),
        EngineCmd::Insert { paths, mode, index } => {
            tracing::debug!(count = paths.len(), mode, index, "engine: insert");
            player.insert_tracks(
                paths.iter().map(String::as_str),
                insert_position(mode, index),
            );
        }
        EngineCmd::Toggle => player.toggle(),
        EngineCmd::Play => player.play(),
        EngineCmd::Pause => player.pause(),
        EngineCmd::Stop => player.stop(),
        EngineCmd::Next => player.next(),
        EngineCmd::Previous => player.previous(),
        EngineCmd::Seek(pos) => player.seek(pos),
        EngineCmd::SkipTo(index) => player.skip_to(index),
        EngineCmd::Remove(index) => player.remove(index),
        EngineCmd::ClearQueue => player.clear_queue(),
        EngineCmd::SetVolume(volume) => player.set_volume(volume),
        EngineCmd::SetShuffle(enabled) => player.set_shuffle(enabled),
        EngineCmd::SetRepeat(mode) => player.set_repeat(mode),
        EngineCmd::SetBalance(balance) => player.set_balance(balance.clamp(-100, 100)),
        EngineCmd::SetEqEnabled(enabled) => {
            dsp.eq_enabled = enabled;
            player.set_eq_enabled(enabled);
        }
        EngineCmd::SetEqBand {
            band,
            cutoff_hz,
            q,
            gain_db,
        } => {
            const NEUTRAL: EqBand = EqBand {
                cutoff_hz: 0,
                q: 0.0,
                gain_db: 0.0,
            };
            if dsp.eq_bands.len() <= band {
                dsp.eq_bands.resize(band + 1, NEUTRAL);
            }
            let setting = EqBand {
                cutoff_hz,
                q,
                gain_db,
            };
            dsp.eq_bands[band] = setting;
            player.set_eq_band(band, setting);
        }
        EngineCmd::SetEqPrecut(db) => {
            dsp.eq_precut = db;
            player.set_eq_precut(db);
        }
        EngineCmd::SetTone { bass_db, treble_db } => {
            dsp.tone.bass_db = bass_db;
            dsp.tone.treble_db = treble_db;
            player.set_tone(dsp.tone);
        }
        EngineCmd::SetToneCutoffs { bass_hz, treble_hz } => {
            dsp.tone.bass_cutoff_hz = bass_hz;
            dsp.tone.treble_cutoff_hz = treble_hz;
            player.set_tone(dsp.tone);
        }
        EngineCmd::SetCrossfade { mode, opts } => {
            player.set_crossfade(dsp::crossfade_settings(mode, opts));
        }
        EngineCmd::SetChannelMode(code) => player.set_channel_mode(dsp::channel_mode(code)),
        EngineCmd::SetStereoWidth(percent) => player.set_stereo_width(percent),
        EngineCmd::SetReplaygain {
            mode,
            noclip,
            preamp_db,
        } => player.set_replaygain(dsp::replaygain_mode(mode), preamp_db, noclip),
        EngineCmd::SetCrossfeed {
            mode,
            direct_gain,
            cross_gain,
            high_freq_gain,
            hf_cutoff,
        } => {
            dsp.crossfeed.mode = dsp::crossfeed_mode(mode);
            dsp.crossfeed.direct_gain = direct_gain;
            dsp.crossfeed.cross_gain = cross_gain;
            dsp.crossfeed.high_freq_gain = high_freq_gain;
            dsp.crossfeed.high_freq_cutoff = hf_cutoff;
            player.set_crossfeed(dsp.crossfeed);
        }
        EngineCmd::SetPbe { strength, precut } => {
            player.set_bass_enhancement(rockbox_playback::BassEnhancement { strength, precut });
        }
        EngineCmd::SetCompressor(opts) => player.set_compressor(dsp::compressor(opts)),
        EngineCmd::SetSurround(opts) => player.set_surround(dsp::surround(opts)),
        // Answered in the loop before apply() is reached; kept here only so the
        // match stays exhaustive.
        EngineCmd::GetSnapshot(_) => {}
    }
}
