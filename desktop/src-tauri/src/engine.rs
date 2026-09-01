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
}

/// A `Send + Clone` snapshot of the engine, refreshed by the engine thread.
#[derive(Clone)]
pub struct Snapshot {
    pub status: Status,
    pub volume: f32,
    /// The queue's URLs/paths, verbatim — the frontend shim keys track
    /// metadata by exact queue string (like rockbox-wasm's queue events).
    pub queue: Vec<String>,
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
                let mut position = PositionFilter::default();
                loop {
                    match rx.recv_timeout(Duration::from_millis(250)) {
                        Ok(cmd) => apply(&player, &mut dsp, cmd),
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                    let mut status = player.status();
                    status.position = position.smooth(&status);
                    let snap = Snapshot {
                        status,
                        volume: player.volume(),
                        queue: player
                            .queue()
                            .iter()
                            .map(|p| p.to_string_lossy().into_owned())
                            .collect(),
                    };
                    *shared.lock().unwrap() = snap;
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
    }
}

/// Smooths the engine's reported playback position.
///
/// `Player::status()` derives position as `decode_pos_ms - ring_fill`, and the
/// two terms are sampled independently: the decoder advances a block at a time
/// while the output drains the ring continuously, so their difference jitters
/// in BOTH directions by roughly a decode block. Read straight through, the
/// miniplayer's clock stutters and slides backwards — with a 10 s buffer the
/// ring term is big enough for that to be seconds.
///
/// So anchor to the wall clock and let the position advance in real time,
/// re-syncing only when the engine disagrees by more than jitter can explain —
/// a seek, a track change, or a genuine stall.
#[derive(Default)]
pub struct PositionFilter {
    anchor: Option<Anchor>,
}

struct Anchor {
    /// Queue index the anchor belongs to; a change means a different track.
    index: Option<usize>,
    reported_ms: f64,
    at: Instant,
}

/// Past this the engine is not disagreeing, it is somewhere else: a seek, a
/// track restart, a long stall. Below it, the difference is drift to be
/// absorbed rather than a position to jump to.
const STEP_MS: f64 = 3_000.0;

/// Fraction of the remaining error to take out per sample. The rate limits
/// below cap it, so this only sets how eagerly it converges within them.
const SLEW_GAIN: f64 = 0.5;

/// Rate limits for the correction, as a fraction of real time: the clock may
/// run at 1.5x to catch up or 0.5x to fall back, never faster or slower. The
/// slow limit is what guarantees it still moves FORWARD while correcting —
/// which is the whole point, a progress bar must never step back.
const MAX_SPEEDUP: f64 = 0.5;
const MAX_SLOWDOWN: f64 = 0.5;

impl PositionFilter {
    /// The position to report for `status`, in place of `status.position`.
    pub fn smooth(&mut self, status: &Status) -> Duration {
        let raw_ms = status.position.as_millis() as f64;
        let duration_ms = status.duration.as_millis() as u64;

        // Only playback moves the clock. While paused or stopped the engine's
        // value is static, so there is nothing to smooth and re-anchoring keeps
        // a resume from inheriting a stale anchor.
        if status.state != PlaybackState::Playing {
            self.anchor = Some(Anchor {
                index: status.index,
                reported_ms: raw_ms,
                at: Instant::now(),
            });
            return status.position;
        }

        let now = Instant::now();
        let Some(anchor) = self.anchor.as_ref().filter(|a| a.index == status.index) else {
            // No anchor, or a different track: take the engine at its word.
            self.anchor = Some(Anchor {
                index: status.index,
                reported_ms: raw_ms,
                at: now,
            });
            return status.position;
        };

        let dt_ms = now.duration_since(anchor.at).as_secs_f64() * 1000.0;
        let expected_ms = anchor.reported_ms + dt_ms;
        let error_ms = raw_ms - expected_ms;

        if error_ms.abs() > STEP_MS {
            // Genuinely somewhere else — following it is right, and no amount of
            // slewing would hide a jump that large anyway.
            self.anchor = Some(Anchor {
                index: status.index,
                reported_ms: raw_ms,
                at: now,
            });
            return status.position;
        }

        // Slew: bend the clock toward the engine instead of snapping to it, so
        // the correction is spread over the next second or two and reads as the
        // bar moving rather than jumping.
        let correction = (error_ms * SLEW_GAIN).clamp(-dt_ms * MAX_SLOWDOWN, dt_ms * MAX_SPEEDUP);
        let mut reported = (expected_ms + correction).max(anchor.reported_ms);
        // Never run past the end: the track ends and the index changes a moment
        // later, and a progress bar that overshoots looks broken.
        if duration_ms > 0 {
            reported = reported.min(duration_ms as f64);
        }
        self.anchor = Some(Anchor {
            index: status.index,
            reported_ms: reported,
            at: now,
        });
        Duration::from_millis(reported as u64)
    }
}
