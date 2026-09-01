//! Thread confinement for the playback engine.
//!
//! `rockbox_playback::Player` owns the cpal output stream and is `!Send`, so
//! it lives on a dedicated thread. `Engine` is the `Send + Sync` handle the
//! rest of the daemon holds: commands go over a channel, and the thread
//! refreshes a shared status snapshot after every command and on a 250 ms
//! tick.

use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rockbox_playback::{
    BassEnhancement, ChannelMode, Compressor, CrossfadeSettings, Crossfeed, Equalizer,
    PlaybackState, Player, PlayerConfig, RepeatMode, ReplayGainMode, Status, Surround,
    ToneControls,
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
    SetStereoWidth(i32),
    SetCrossfeed(Crossfeed),
    SetCompressor(Compressor),
    SetSurround(Surround),
    SetBassEnhancement(BassEnhancement),
    /// 0.0..=1.0.
    SetVolume(f32),
    SetShuffle(bool),
    SetRepeat(RepeatMode),
    /// Restore the persisted queue + position from the resume file. Cues the
    /// track paused with the seek deferred until it opens — a bare `Seek` would
    /// be dropped, since there is no decoder open yet.
    Resume,
}

/// A `Send + Clone` snapshot of the engine, refreshed by the engine thread.
#[derive(Clone)]
pub struct Snapshot {
    pub status: Status,
    /// Output volume 0.0..=1.0.
    pub volume: f32,
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
                let mut position = PositionFilter::default();
                loop {
                    match rx.recv_timeout(Duration::from_millis(250)) {
                        Ok(cmd) => apply(&player, cmd),
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                    let mut status = player.status();
                    status.position = position.smooth(&status);
                    *shared.lock().unwrap() = Snapshot {
                        status,
                        volume: player.volume(),
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
        EngineCmd::SetStereoWidth(percent) => player.set_stereo_width(percent),
        EngineCmd::SetCrossfeed(crossfeed) => player.set_crossfeed(crossfeed),
        EngineCmd::SetCompressor(compressor) => player.set_compressor(compressor),
        EngineCmd::SetSurround(surround) => player.set_surround(surround),
        EngineCmd::SetBassEnhancement(pbe) => player.set_bass_enhancement(pbe),
        EngineCmd::SetVolume(volume) => player.set_volume(volume),
        EngineCmd::SetShuffle(enabled) => player.set_shuffle(enabled),
        EngineCmd::SetRepeat(mode) => player.set_repeat(mode),
        EngineCmd::Resume => {
            match player.resume() {
                Some(state) => tracing::info!(
                    tracks = state.tracks.len(),
                    index = state.index,
                    elapsed_ms = state.elapsed.as_millis() as u64,
                    "resumed queue"
                ),
                None => tracing::debug!("nothing to resume"),
            };
        }
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

#[cfg(test)]
mod position_tests {
    use super::*;
    use rockbox_playback::{PlaybackState, RepeatMode};

    fn status(state: PlaybackState, index: Option<usize>, pos_ms: u64) -> Status {
        Status {
            state,
            index,
            position: Duration::from_millis(pos_ms),
            duration: Duration::from_millis(300_000),
            metadata: None,
            queue_len: 1,
            shuffle: false,
            repeat: RepeatMode::Off,
        }
    }

    /// The bug: `decode_pos_ms - ring_fill` jitters both ways, so a raw read
    /// slides backwards. The filter must never report a position lower than the
    /// one before it, for jitter within the resync window.
    #[test]
    fn jitter_never_moves_the_clock_backwards() {
        let mut f = PositionFilter::default();
        // A raw sequence that dips and spikes the way the subtraction does.
        let raw = [10_000u64, 10_400, 9_900, 10_800, 10_100, 11_200, 10_600];
        let mut last = 0u64;
        for r in raw {
            let out = f
                .smooth(&status(PlaybackState::Playing, Some(0), r))
                .as_millis() as u64;
            assert!(out + 1 >= last, "went backwards: {last} -> {out} (raw {r})");
            last = out;
        }
    }

    /// The point of slewing: a drift the engine reports is absorbed gradually,
    /// so no single sample moves the clock by a visible jump.
    #[test]
    fn drift_is_absorbed_without_a_visible_jump() {
        let mut f = PositionFilter::default();
        f.smooth(&status(PlaybackState::Playing, Some(0), 10_000));
        // The engine now says we are 2s ahead of where our clock thinks it is —
        // under the step threshold, so it must be slewed, not snapped.
        let mut last = 10_000i64;
        let error_before = (12_000 - last).abs();
        for _ in 0..40 {
            std::thread::sleep(Duration::from_millis(25));
            let out = f
                .smooth(&status(PlaybackState::Playing, Some(0), 12_000))
                .as_millis() as i64;
            let step = out - last;
            assert!(step >= 0, "clock went backwards: {last} -> {out}");
            // No single sample may move the bar by a visible amount: at 1.5x
            // the cap, a ~25ms sample is worth ~40ms.
            assert!(step < 200, "visible jump of {step}ms");
            last = out;
        }
        // Convergence is deliberately rate-limited, so what matters is that the
        // error is being eaten steadily — not that it vanishes in one go.
        let error_after = (12_000 - last).abs();
        assert!(
            error_after < error_before / 2,
            "drift barely moved: {error_before}ms -> {error_after}ms"
        );
    }

    /// Slewing must not be able to stall the clock, let alone reverse it: even
    /// while correcting downward it keeps moving forward.
    #[test]
    fn correcting_downward_still_moves_forward() {
        let mut f = PositionFilter::default();
        f.smooth(&status(PlaybackState::Playing, Some(0), 60_000));
        std::thread::sleep(Duration::from_millis(50));
        // Engine reports BEHIND our clock (a stall), within the step threshold.
        let mut last = f
            .smooth(&status(PlaybackState::Playing, Some(0), 58_500))
            .as_millis() as i64;
        for _ in 0..10 {
            std::thread::sleep(Duration::from_millis(25));
            let out = f
                .smooth(&status(PlaybackState::Playing, Some(0), 58_500))
                .as_millis() as i64;
            assert!(
                out >= last,
                "went backwards while correcting: {last} -> {out}"
            );
            last = out;
        }
    }

    /// A real seek is bigger than jitter and must be followed immediately.
    #[test]
    fn a_seek_is_followed_not_smoothed() {
        let mut f = PositionFilter::default();
        f.smooth(&status(PlaybackState::Playing, Some(0), 10_000));
        let out = f
            .smooth(&status(PlaybackState::Playing, Some(0), 120_000))
            .as_millis() as u64;
        assert_eq!(out, 120_000, "seek forward should snap");
        let back = f
            .smooth(&status(PlaybackState::Playing, Some(0), 5_000))
            .as_millis() as u64;
        assert_eq!(back, 5_000, "seek backward should snap");
    }

    /// A track change resets the anchor — otherwise the new track would inherit
    /// the old one's clock and start part-way through.
    #[test]
    fn a_track_change_resets_the_anchor() {
        let mut f = PositionFilter::default();
        f.smooth(&status(PlaybackState::Playing, Some(0), 200_000));
        let out = f
            .smooth(&status(PlaybackState::Playing, Some(1), 0))
            .as_millis() as u64;
        assert_eq!(out, 0, "next track starts at its own position");
    }

    /// Paused is reported verbatim: nothing is moving, so there is nothing to
    /// interpolate, and the clock must not creep while the user is paused.
    #[test]
    fn paused_does_not_advance() {
        let mut f = PositionFilter::default();
        f.smooth(&status(PlaybackState::Playing, Some(0), 30_000));
        std::thread::sleep(Duration::from_millis(30));
        let a = f
            .smooth(&status(PlaybackState::Paused, Some(0), 30_000))
            .as_millis() as u64;
        std::thread::sleep(Duration::from_millis(30));
        let b = f
            .smooth(&status(PlaybackState::Paused, Some(0), 30_000))
            .as_millis() as u64;
        assert_eq!(a, 30_000);
        assert_eq!(b, 30_000, "a paused clock must not creep");
    }

    /// The reported position must not run past the end of the track.
    #[test]
    fn never_overshoots_the_duration() {
        let mut f = PositionFilter::default();
        let mut s = status(PlaybackState::Playing, Some(0), 299_900);
        s.duration = Duration::from_millis(300_000);
        f.smooth(&s);
        std::thread::sleep(Duration::from_millis(250));
        let out = f.smooth(&s).as_millis() as u64;
        assert!(out <= 300_000, "overshot the track: {out}");
    }
}
