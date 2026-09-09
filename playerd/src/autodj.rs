//! Auto DJ — transitions shaped by what the music actually does.
//!
//! A fixed crossfade blends the last N seconds of one track into the first N
//! of the next, whatever is in them. On real records that is often two seconds
//! of room tone fading into a second of silence: the "crossfade" you hear is
//! the gap.
//!
//! Auto DJ analyses both sides of the transition ([`crate::analysis`]) and
//! programs the engine so the fade lands on the *music*: the outgoing ramp
//! finishes where its last note does, and the incoming track's own lead-in
//! silence is spent inside the overlap rather than after it.
//!
//! # Programming the fade
//!
//! Rockbox anchors the crossfade region to the **end of the outgoing file**.
//! The region is `R = max(out_delay + out_duration, in_delay + in_duration)`
//! frames long, the outgoing ramp finishes `out_delay + out_duration` into it,
//! and the incoming track starts playing at the region's start — including
//! whatever silence it opens with.
//!
//! So, writing `trailing` for the outgoing track's silent tail, `lead` for the
//! incoming track's silent head and `overlap` for the music-on-music blend we
//! want:
//!
//! ```text
//! out_delay    = 0                            ⎫ the outgoing ramp runs for
//! out_duration = overlap                      ⎭ the last `overlap` of music
//! in_delay     = lead                         ⎫ the incoming fade starts when
//! in_duration  = overlap + trailing − lead    ⎭ its music does
//!
//! ⇒ R = overlap + trailing, and R − (out_delay + out_duration) = trailing,
//!   which is exactly "the outgoing ramp ends where the music ends".
//! ```
//!
//! # Turning it on
//!
//! `crossfade.mode = "auto"` in an `audio_settings` command (or in the
//! `[autodj]` config). It is a crossfade mode rather than a new command
//! because that is what it is — and it means a player that predates Auto DJ
//! reads an unknown mode, falls back to "off", and still plays the music.

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{bail, Context, Result};
use rockbox_playback::{CrossfadeMode, CrossfadeSettings, MixMode};

use crate::analysis::cache::AnalysisCache;
use crate::analysis::TrackAnalysis;
use crate::config::Config;
use crate::engine::EngineCmd;
use crate::remote::Shared;

/// How often the transition for the *next* track change is recomputed. The
/// engine only reads the settings when the transition arrives, so this needs
/// to be timely, not instant.
const TICK: Duration = Duration::from_secs(2);

/// Rockbox's own limits (`apps/settings_list.c`): delays cap at 7 s, ramps at
/// 15 s. Anything longer silently clamps, so clamp deliberately instead.
const MAX_DELAY_MS: u64 = 7_000;
const MAX_DURATION_MS: u64 = 15_000;

/// Refuse to download a track that is implausibly large for analysis — a
/// misrouted URL should not eat the disk.
const MAX_ANALYSIS_BYTES: usize = 200 * 1024 * 1024;

pub struct AutoDj {
    enabled: AtomicBool,
    overlap_ms: AtomicU64,
    target_lufs: f64,
    cache: AnalysisCache,
    http: reqwest::Client,
    /// The (outgoing, incoming) pair the engine is currently programmed for,
    /// so an unchanged queue is not re-programmed every tick.
    programmed: Mutex<Option<(String, String)>>,
    /// Tracks being analysed right now, so a slow decode is not started twice.
    inflight: Mutex<HashSet<String>>,
}

impl AutoDj {
    pub fn new(config: &Config, cache: AnalysisCache) -> Self {
        AutoDj {
            enabled: AtomicBool::new(config.autodj.enabled),
            overlap_ms: AtomicU64::new((config.autodj.overlap_seconds.max(0.5) * 1000.0) as u64),
            target_lufs: config.autodj.target_lufs as f64,
            cache,
            http: reqwest::Client::new(),
            programmed: Mutex::new(None),
            inflight: Mutex::new(HashSet::new()),
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    pub fn overlap_ms(&self) -> u64 {
        self.overlap_ms.load(Ordering::Relaxed)
    }

    /// Turn Auto DJ on, optionally with a new overlap. Returns whether this
    /// changed anything, so the caller can log a state change and not a
    /// re-assertion of the same thing.
    pub fn enable(&self, overlap_ms: Option<u64>) -> bool {
        if let Some(overlap) = overlap_ms.filter(|ms| *ms >= 500) {
            self.overlap_ms
                .store(overlap.min(MAX_DURATION_MS), Ordering::Relaxed);
        }
        let was = self.enabled.swap(true, Ordering::Relaxed);
        if !was {
            // Re-program from scratch: what the engine holds now came from
            // whatever crossfade mode was in force before.
            *self.programmed.lock().unwrap() = None;
        }
        !was
    }

    /// Turn Auto DJ off. The caller restores whatever crossfade the settings
    /// document asked for — Auto DJ does not own the engine's baseline.
    pub fn disable(&self) -> bool {
        *self.programmed.lock().unwrap() = None;
        self.enabled.swap(false, Ordering::Relaxed)
    }

    /// The analysis for `uri`, computing (and caching) it if needed.
    /// `track_key` is the stable identity — a library id, not the stream URL,
    /// whose token rotates.
    pub async fn analysis_for(&self, track_key: &str, uri: &str) -> Result<TrackAnalysis> {
        if let Some(cached) = self.cache.get(track_key).await {
            return Ok(cached);
        }
        let bytes = fetch(&self.http, uri).await?;
        let hint = hint_for(uri);
        let target = self.target_lufs;
        let analysis = tokio::task::spawn_blocking(move || {
            crate::analysis::analyze(bytes, hint.as_deref(), target)
        })
        .await
        .context("analysis task panicked")??;
        if let Err(e) = self.cache.put(track_key, &analysis).await {
            tracing::warn!("could not cache analysis for {track_key}: {e:#}");
        }
        Ok(analysis)
    }
}

/// Watch the queue and keep the next transition programmed.
pub async fn run(shared: Arc<Shared>, autodj: Arc<AutoDj>) {
    if autodj.is_enabled() {
        tracing::info!(
            overlap_ms = autodj.overlap_ms(),
            "auto dj on: transitions follow the music"
        );
    }
    loop {
        tokio::time::sleep(TICK).await;
        if !autodj.is_enabled() {
            continue;
        }
        if let Err(e) = tick(&shared, &autodj).await {
            tracing::debug!("auto dj: {e:#}");
        }
    }
}

async fn tick(shared: &Arc<Shared>, autodj: &Arc<AutoDj>) -> Result<()> {
    let snapshot = shared.engine.snapshot();
    let Some(index) = snapshot.status.index else {
        return Ok(());
    };
    let Some(current_uri) = snapshot.queue.get(index) else {
        return Ok(());
    };
    // The queue's last track has no transition to shape. Repeat-all wraps to
    // the top, and that transition is worth getting right too.
    let next_uri = match snapshot.queue.get(index + 1) {
        Some(uri) => uri,
        None if snapshot.status.repeat == rockbox_playback::RepeatMode::All => snapshot
            .queue
            .first()
            .filter(|_| snapshot.queue.len() > 1)
            .ok_or_else(|| anyhow::anyhow!("nothing follows the current track"))?,
        None => return Ok(()),
    };

    let pair = (current_uri.clone(), next_uri.clone());
    if shared_pair_matches(autodj, &pair) {
        return Ok(());
    }

    let current_key = shared.analysis_key(current_uri);
    let next_key = shared.analysis_key(next_uri);
    let (Some(outgoing), Some(incoming)) = (
        ensure_analysis(autodj, &current_key, current_uri).await,
        ensure_analysis(autodj, &next_key, next_uri).await,
    ) else {
        // Still analysing (or unanalysable). Leave the engine as it is and try
        // again next tick — a plain crossfade is a better failure than none.
        return Ok(());
    };

    let settings = transition(&outgoing, &incoming, autodj.overlap_ms());
    tracing::info!(
        out_ms = settings.fade_out_duration.as_millis() as u64,
        in_delay_ms = settings.fade_in_delay.as_millis() as u64,
        in_ms = settings.fade_in_duration.as_millis() as u64,
        tail_ms = outgoing.tail_silence_ms(),
        lead_ms = incoming.music_start_ms,
        "auto dj: programmed the next transition"
    );
    shared.engine.send(EngineCmd::SetCrossfade(settings));
    *autodj.programmed.lock().unwrap() = Some(pair);
    Ok(())
}

fn shared_pair_matches(autodj: &Arc<AutoDj>, pair: &(String, String)) -> bool {
    autodj
        .programmed
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|programmed| programmed == pair)
}

/// Cached analysis, or `None` while one is being computed in the background.
/// Analysis is never awaited inline: a decode takes seconds and the tick loop
/// has a transition to keep up with.
async fn ensure_analysis(
    autodj: &Arc<AutoDj>,
    track_key: &str,
    uri: &str,
) -> Option<TrackAnalysis> {
    if let Some(cached) = autodj.cache.get(track_key).await {
        return Some(cached);
    }
    {
        let mut inflight = autodj.inflight.lock().unwrap();
        if !inflight.insert(track_key.to_string()) {
            return None;
        }
    }
    let autodj = autodj.clone();
    let track_key = track_key.to_string();
    let uri = uri.to_string();
    tokio::spawn(async move {
        match autodj.analysis_for(&track_key, &uri).await {
            Ok(analysis) => tracing::debug!(
                track = %track_key,
                lufs = analysis.integrated_lufs,
                bpm = ?analysis.bpm,
                "auto dj: analysed"
            ),
            Err(e) => tracing::warn!("auto dj: could not analyse {track_key}: {e:#}"),
        }
        autodj.inflight.lock().unwrap().remove(&track_key);
    });
    None
}

/// Build the crossfade for one specific transition. See the module docs for
/// where the arithmetic comes from.
pub fn transition(
    outgoing: &TrackAnalysis,
    incoming: &TrackAnalysis,
    overlap_ms: u64,
) -> CrossfadeSettings {
    let overlap = overlap_ms.clamp(500, MAX_DURATION_MS);
    let trailing = outgoing.tail_silence_ms().min(MAX_DURATION_MS);
    // The incoming delay is capped harder than the ramp, so a track with a
    // very long intro spends what it can inside the overlap.
    let lead = incoming.music_start_ms.min(MAX_DELAY_MS);

    let region = overlap + trailing;
    // Leave the fade-in a real ramp even when the intro is longer than the
    // whole region; a zero-length fade would be a hard cut into the mix.
    let lead = lead.min(region.saturating_sub(500));
    let fade_in_duration = (region - lead).clamp(500, MAX_DURATION_MS);

    CrossfadeSettings {
        mode: CrossfadeMode::Always,
        fade_out_delay: Duration::ZERO,
        fade_out_duration: Duration::from_millis(overlap),
        fade_in_delay: Duration::from_millis(lead),
        fade_in_duration: Duration::from_millis(fade_in_duration),
        mix_mode: MixMode::Crossfade,
    }
}

/// Read a track's bytes, from disk or over HTTP.
async fn fetch(http: &reqwest::Client, uri: &str) -> Result<Vec<u8>> {
    if !(uri.starts_with("http://") || uri.starts_with("https://")) {
        return std::fs::read(uri).with_context(|| format!("reading {uri}"));
    }
    let response = http
        .get(uri)
        .send()
        .await
        .with_context(|| format!("fetching {uri}"))?;
    if !response.status().is_success() {
        bail!("fetching audio: HTTP {}", response.status());
    }
    if let Some(len) = response.content_length() {
        if len as usize > MAX_ANALYSIS_BYTES {
            bail!("track is {len} bytes, too large to analyse");
        }
    }
    let bytes = response.bytes().await.context("reading audio body")?;
    if bytes.len() > MAX_ANALYSIS_BYTES {
        bail!("track is {} bytes, too large to analyse", bytes.len());
    }
    Ok(bytes.to_vec())
}

/// A container hint for the decoder, from the URI's extension. Stream URLs
/// carry a query string, so strip that first.
fn hint_for(uri: &str) -> Option<String> {
    let path = uri.split('?').next().unwrap_or(uri);
    std::path::Path::new(path)
        .extension()
        .map(|ext| ext.to_string_lossy().into_owned())
        .filter(|ext| !ext.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(duration_ms: u64, music_start_ms: u64, music_end_ms: u64) -> TrackAnalysis {
        TrackAnalysis {
            duration_ms,
            sample_rate: 44_100,
            channels: 2,
            integrated_lufs: -12.0,
            true_peak: 0.9,
            recommended_gain_db: -2.0,
            target_lufs: -14.0,
            loudness_range: 6.0,
            music_start_ms,
            music_end_ms,
            waveform: Vec::new(),
            bpm: None,
            bpm_confidence: None,
            tempo_stability: None,
            musical_key: None,
            camelot: None,
            key_root: None,
            key_major: None,
            analyzed_at: 0,
        }
    }

    /// The property that matters: the outgoing ramp has to finish exactly
    /// where its music does, which means the region must exceed the outgoing
    /// side by the length of the silent tail.
    fn ramp_ends_before_file_end(settings: &CrossfadeSettings) -> u64 {
        let out_side = settings.fade_out_delay + settings.fade_out_duration;
        let in_side = settings.fade_in_delay + settings.fade_in_duration;
        let region = out_side.max(in_side);
        (region - out_side).as_millis() as u64
    }

    #[test]
    fn the_ramp_ends_where_the_music_does() {
        // 3 s of silence after the last note, 1 s of silence before the first.
        let outgoing = track(200_000, 0, 197_000);
        let incoming = track(200_000, 1_000, 200_000);
        let settings = transition(&outgoing, &incoming, 6_000);

        assert_eq!(ramp_ends_before_file_end(&settings), 3_000);
        assert_eq!(settings.fade_out_duration, Duration::from_millis(6_000));
        // The incoming fade starts when its music does…
        assert_eq!(settings.fade_in_delay, Duration::from_millis(1_000));
        // …and runs to the end of the region.
        assert_eq!(settings.fade_in_duration, Duration::from_millis(8_000));
    }

    #[test]
    fn a_gapless_pair_is_a_plain_overlap() {
        let outgoing = track(200_000, 0, 200_000);
        let incoming = track(200_000, 0, 200_000);
        let settings = transition(&outgoing, &incoming, 4_000);

        assert_eq!(ramp_ends_before_file_end(&settings), 0);
        assert_eq!(settings.fade_out_duration, Duration::from_millis(4_000));
        assert_eq!(settings.fade_in_delay, Duration::ZERO);
        assert_eq!(settings.fade_in_duration, Duration::from_millis(4_000));
    }

    #[test]
    fn a_long_intro_still_leaves_a_ramp() {
        // A 30 s ambient intro cannot be waited out inside a 5 s overlap.
        let outgoing = track(200_000, 0, 200_000);
        let incoming = track(200_000, 30_000, 200_000);
        let settings = transition(&outgoing, &incoming, 5_000);

        assert!(settings.fade_in_duration >= Duration::from_millis(500));
        assert!(settings.fade_in_delay < Duration::from_millis(5_000));
    }

    #[test]
    fn everything_stays_inside_the_engine_limits() {
        let outgoing = track(600_000, 0, 560_000); // a 40 s tail
        let incoming = track(600_000, 20_000, 600_000); // a 20 s intro
        let settings = transition(&outgoing, &incoming, 20_000);

        assert!(settings.fade_out_delay <= Duration::from_millis(MAX_DELAY_MS));
        assert!(settings.fade_in_delay <= Duration::from_millis(MAX_DELAY_MS));
        assert!(settings.fade_out_duration <= Duration::from_millis(MAX_DURATION_MS));
        assert!(settings.fade_in_duration <= Duration::from_millis(MAX_DURATION_MS));
    }

    #[test]
    fn hints_come_from_the_path_not_the_query() {
        assert_eq!(hint_for("/music/a.flac").as_deref(), Some("flac"));
        assert_eq!(
            hint_for("https://api.rocksky.app/uploads/x/stream?token=abc").as_deref(),
            None
        );
        assert_eq!(
            hint_for("https://navidrome.rocksky.app/rest/stream.mp3?id=1").as_deref(),
            Some("mp3")
        );
    }
}
