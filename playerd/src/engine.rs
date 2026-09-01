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
    /// Reply with a snapshot taken NOW, on the engine thread — the live read
    /// path behind [`Engine::snapshot`].
    GetSnapshot(Sender<Snapshot>),
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
            taken: Instant::now(),
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
                            apply(&player, cmd);
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

    /// The engine state, read LIVE on the engine thread — no cache. The shared
    /// snapshot is only a fallback for when the thread cannot answer within
    /// 100ms, extrapolated to read time so even the fallback ticks evenly (see
    /// the desktop engine for the full story).
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
            | EngineCmd::OpenAt { .. }
            | EngineCmd::Remove(_)
            | EngineCmd::Resume
    )
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
        // Answered in the loop before apply() is reached; kept here only so the
        // match stays exhaustive.
        EngineCmd::GetSnapshot(_) => {}
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

#[cfg(test)]
mod boundary_tests {
    use super::*;
    use rockbox_playback::{PlaybackState, RepeatMode};

    fn status(state: PlaybackState, index: Option<usize>, pos_ms: u64, dur_ms: u64) -> Status {
        Status {
            state,
            index,
            position: Duration::from_millis(pos_ms),
            duration: Duration::from_millis(dur_ms),
            metadata: None,
            queue_len: 2,
            shuffle: false,
            repeat: RepeatMode::Off,
        }
    }

    /// The measured pathology: mid-track, the crate flips to the next track's
    /// index with position ≈0. The smoother must keep reporting the audible
    /// track — same index, same duration, position still advancing.
    #[test]
    fn decode_side_flip_is_held() {
        let mut sm = BoundarySmoother::default();
        sm.filter(status(PlaybackState::Playing, Some(0), 5_000, 15_000));
        std::thread::sleep(Duration::from_millis(30));
        let out = sm.filter(status(PlaybackState::Playing, Some(1), 0, 12_000));
        assert_eq!(out.index, Some(0), "index must stay on the audible track");
        assert_eq!(out.duration.as_millis(), 15_000, "duration must stay too");
        assert!(
            out.position.as_millis() >= 5_000,
            "position went backwards: {}ms",
            out.position.as_millis()
        );
    }

    /// Once the held track's duration runs out, the raw status (≈0 into the
    /// next track) is the truth and must be released to.
    #[test]
    fn hold_releases_at_the_audible_boundary() {
        let mut sm = BoundarySmoother::default();
        sm.filter(status(PlaybackState::Playing, Some(0), 14_950, 15_000));
        std::thread::sleep(Duration::from_millis(30));
        // Flip arrives; held for the last few ms...
        let held = sm.filter(status(PlaybackState::Playing, Some(1), 0, 12_000));
        assert_eq!(held.index, Some(0));
        std::thread::sleep(Duration::from_millis(120));
        // ...and released once the old duration is spent.
        let out = sm.filter(status(PlaybackState::Playing, Some(1), 150, 12_000));
        assert_eq!(out.index, Some(1), "must release at the boundary");
        assert_eq!(out.duration.as_millis(), 12_000);
    }

    /// A user seek backwards is intentional and must NOT be held.
    #[test]
    fn an_intentional_jump_passes_through() {
        let mut sm = BoundarySmoother::default();
        sm.filter(status(PlaybackState::Playing, Some(0), 60_000, 180_000));
        sm.expect_jump = true; // what the command loop sets on Seek
        let out = sm.filter(status(PlaybackState::Playing, Some(0), 5_000, 180_000));
        assert_eq!(out.position.as_millis(), 5_000, "seek must be followed");
    }

    /// Pausing while held freezes the projected position.
    #[test]
    fn pause_freezes_a_hold() {
        let mut sm = BoundarySmoother::default();
        sm.filter(status(PlaybackState::Playing, Some(0), 5_000, 15_000));
        std::thread::sleep(Duration::from_millis(20));
        sm.filter(status(PlaybackState::Playing, Some(1), 0, 12_000));
        let a = sm
            .filter(status(PlaybackState::Paused, Some(1), 0, 12_000))
            .position;
        std::thread::sleep(Duration::from_millis(40));
        let b = sm
            .filter(status(PlaybackState::Paused, Some(1), 0, 12_000))
            .position;
        assert_eq!(a.as_millis(), b.as_millis(), "held clock ran while paused");
    }

    /// Stopped clears everything — the next play starts from the raw truth.
    #[test]
    fn stopped_resets() {
        let mut sm = BoundarySmoother::default();
        sm.filter(status(PlaybackState::Playing, Some(0), 5_000, 15_000));
        sm.filter(status(PlaybackState::Playing, Some(1), 0, 12_000)); // held
        sm.filter(status(PlaybackState::Stopped, None, 0, 0));
        let out = sm.filter(status(PlaybackState::Playing, Some(1), 100, 12_000));
        assert_eq!(out.index, Some(1));
        assert_eq!(out.position.as_millis(), 100);
    }
}
