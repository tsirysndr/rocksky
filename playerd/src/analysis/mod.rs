//! On-device audio analysis: what a track actually sounds like.
//!
//! One decode pass (see [`decode`]) yields four things worth knowing:
//!
//! - **Loudness** — EBU R128 integrated LUFS and true peak, so a set can be
//!   levelled instead of lurching between a quiet album track and a loud
//!   single.
//! - **Edges** — where the music really starts and ends, past the silence and
//!   the fade. This is what makes a transition sound deliberate: fade out of
//!   the *music*, not out of two seconds of room tone.
//! - **Shape** — a coarse waveform, for display and for reasoning about a
//!   track's dynamics.
//! - **Feel** — tempo and musical key (with its Camelot code, for harmonic
//!   mixing) from `oximedia-mir`, plus an energy figure derived from all of
//!   the above.
//!
//! Everything is computed locally and cached in SQLite, so a track is decoded
//! once and every later question about it is a lookup.

pub mod cache;
pub mod decode;

use anyhow::{anyhow, Result};
use oximedia_mir::dj_features::CamelotWheel;
use serde::{Deserialize, Serialize};

/// Loudness target used to derive `recommended_gain_db`: the streaming-era
/// default, and what the Rocksky apps normalise to.
pub const DEFAULT_TARGET_LUFS: f64 = -14.0;

/// Waveform resolution. 200 bins is enough to see a track's shape in a
/// miniplayer and small enough to keep the cache row tiny.
const WAVEFORM_BINS: usize = 200;

/// A hop counts as music when its peak is within this many dB of the track's
/// own peak. -45 dB clears room tone, tape hiss and dither without eating a
/// genuinely quiet intro.
const SILENCE_FLOOR_DB: f32 = -45.0;

/// MIR runs on a window rather than the whole track: the middle of a song is
/// where its tempo and key actually live, and a minute is plenty.
const MIR_WINDOW_SECS: f32 = 60.0;

const MIN_BPM: f32 = 60.0;
const MAX_BPM: f32 = 200.0;

/// Everything the analysis knows about one track.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackAnalysis {
    pub duration_ms: u64,
    pub sample_rate: u32,
    pub channels: u32,

    /// EBU R128 integrated loudness, LUFS.
    pub integrated_lufs: f64,
    /// True peak, linear (1.0 = full scale).
    pub true_peak: f64,
    /// Gain to reach [`DEFAULT_TARGET_LUFS`], already limited so the true peak
    /// stays under -1 dBTP.
    pub recommended_gain_db: f64,
    pub target_lufs: f64,

    /// Where audible music begins and ends. The tail between `music_end_ms`
    /// and `duration_ms` is the silence (or fade) a content-aware transition
    /// mixes over instead of through.
    pub music_start_ms: u64,
    pub music_end_ms: u64,

    /// Peak magnitude per bin, 0–255, oldest to newest.
    pub waveform: Vec<u8>,

    pub bpm: Option<f32>,
    pub bpm_confidence: Option<f32>,
    /// Tempo steadiness, 0–1. A low value means beat-matching this track is a
    /// fiction — live recordings, rubato, anything unquantised.
    pub tempo_stability: Option<f32>,

    /// e.g. "F# minor".
    pub musical_key: Option<String>,
    /// Camelot code, e.g. "11A" — adjacent codes mix harmonically.
    pub camelot: Option<String>,
    /// Root pitch class (0 = C) and mode, for [`CamelotWheel`] arithmetic.
    pub key_root: Option<u8>,
    pub key_major: Option<bool>,

    /// EBU R128 loudness range, LU. Low means squashed and relentless; high
    /// means the track breathes.
    pub loudness_range: f64,

    /// Unix seconds — cache bookkeeping, and a hint about staleness.
    pub analyzed_at: i64,
}

impl TrackAnalysis {
    /// Silence (or fade-out) between the last music and the end of the file.
    pub fn tail_silence_ms(&self) -> u64 {
        self.duration_ms.saturating_sub(self.music_end_ms)
    }

    /// A single 0–1 figure for sequencing a set: how hard this track pushes.
    ///
    /// A heuristic, deliberately built from measurements that behave on real
    /// music rather than from a mood model: how loud the master is, how fast
    /// it moves, and how little dynamic range it leaves. A -8 LUFS, 130 BPM,
    /// 4 LU track is a peak-hour record; -20 LUFS at 70 BPM with 12 LU is not.
    pub fn energy(&self) -> f32 {
        let loudness = (((self.integrated_lufs + 24.0) / 16.0) as f32).clamp(0.0, 1.0);
        let tempo = self
            .dance_bpm()
            .map(|bpm| ((bpm - 70.0) / 70.0).clamp(0.0, 1.0))
            .unwrap_or(0.5);
        let compression = 1.0 - ((self.loudness_range / 12.0) as f32).clamp(0.0, 1.0);
        (0.45 * loudness + 0.35 * tempo + 0.20 * compression).clamp(0.0, 1.0)
    }

    /// The BPM folded into the 70–140 range a DJ would count in.
    ///
    /// Onset-based detection routinely lands an octave out — half-time on a
    /// trap record, double-time on a rock one — and for comparing two tracks
    /// the octave is noise. Beat-matching handles the fold itself, so this is
    /// only for reasoning about "faster" and "slower".
    pub fn dance_bpm(&self) -> Option<f32> {
        let mut bpm = self.bpm?;
        if !bpm.is_finite() || bpm <= 0.0 {
            return None;
        }
        while bpm >= 140.0 {
            bpm /= 2.0;
        }
        while bpm < 70.0 {
            bpm *= 2.0;
        }
        Some(bpm)
    }
}

/// Analyse decoded audio. CPU-bound and single-threaded — call it from
/// `spawn_blocking`, not on a runtime worker.
pub fn analyze(bytes: Vec<u8>, hint: Option<&str>, target_lufs: f64) -> Result<TrackAnalysis> {
    let decoded = decode::decode(bytes, hint)?;

    let integrated_lufs = decoded
        .loudness
        .loudness_global()
        .map_err(|e| anyhow!("integrated loudness unavailable: {e}"))?;
    if !integrated_lufs.is_finite() {
        return Err(anyhow!(
            "integrated loudness is not finite (digital silence?)"
        ));
    }
    let mut true_peak = 0.0f64;
    for channel in 0..decoded.channels {
        match decoded.loudness.true_peak(channel) {
            Ok(peak) if peak.is_finite() => true_peak = true_peak.max(peak),
            // Older R128 states can refuse true peak; the sample peak is a
            // conservative stand-in for clip protection.
            _ => {
                true_peak = decoded.sample_peak;
                break;
            }
        }
    }

    // A track with no measurable range (a locked-groove, a test tone) reports
    // an error rather than 0 LU; treat that as "no dynamics" and move on.
    let loudness_range = decoded.loudness.loudness_range().unwrap_or(0.0);

    let (music_start_ms, music_end_ms) = music_edges(&decoded.envelope, decoded.envelope_hop_ms);
    let waveform = waveform_bins(&decoded.envelope);
    let feel = analyze_feel(&decoded.mono, decoded.mir_rate);

    Ok(TrackAnalysis {
        duration_ms: decoded.duration_ms,
        sample_rate: decoded.sample_rate,
        channels: decoded.channels,
        integrated_lufs,
        true_peak,
        recommended_gain_db: recommended_gain(integrated_lufs, true_peak, target_lufs),
        target_lufs,
        loudness_range,
        music_start_ms,
        music_end_ms: music_end_ms.min(decoded.duration_ms),
        waveform,
        bpm: feel.bpm,
        bpm_confidence: feel.bpm_confidence,
        tempo_stability: feel.tempo_stability,
        musical_key: feel.musical_key,
        camelot: feel.camelot,
        key_root: feel.key_root,
        key_major: feel.key_major,
        analyzed_at: now_secs(),
    })
}

/// Gain toward `target_lufs`, backed off so the true peak lands no higher than
/// -1 dBTP. Without the ceiling, normalising a quiet-but-hot master up would
/// clip it.
pub fn recommended_gain(integrated_lufs: f64, true_peak: f64, target_lufs: f64) -> f64 {
    let mut gain = target_lufs - integrated_lufs;
    if true_peak > 0.0 {
        let peak_dbtp = 20.0 * true_peak.log10();
        gain = gain.min(-1.0 - peak_dbtp);
    }
    gain.clamp(-24.0, 24.0)
}

/// First and last hop whose peak clears the silence floor, in ms.
fn music_edges(envelope: &[f32], hop_ms: u64) -> (u64, u64) {
    if envelope.is_empty() {
        return (0, 0);
    }
    let peak = envelope.iter().copied().fold(0.0f32, f32::max);
    if peak <= 0.0 {
        return (0, envelope.len() as u64 * hop_ms);
    }
    let floor = peak * 10f32.powf(SILENCE_FLOOR_DB / 20.0);
    let start = envelope.iter().position(|&v| v >= floor).unwrap_or(0);
    let end = envelope
        .iter()
        .rposition(|&v| v >= floor)
        .unwrap_or(envelope.len().saturating_sub(1));
    // The end hop is music *through* its whole span, so count it in full.
    (start as u64 * hop_ms, (end as u64 + 1) * hop_ms)
}

/// Downsample the envelope to [`WAVEFORM_BINS`] peaks, gamma-shaped so quiet
/// passages stay visible next to a loud chorus.
fn waveform_bins(envelope: &[f32]) -> Vec<u8> {
    if envelope.is_empty() {
        return Vec::new();
    }
    let peak = envelope.iter().copied().fold(0.0f32, f32::max).max(1e-9);
    (0..WAVEFORM_BINS)
        .map(|bin| {
            let start = bin * envelope.len() / WAVEFORM_BINS;
            let end = ((bin + 1) * envelope.len() / WAVEFORM_BINS)
                .max(start + 1)
                .min(envelope.len());
            let slice_peak = envelope[start..end].iter().copied().fold(0.0f32, f32::max);
            ((slice_peak / peak).clamp(0.0, 1.0).powf(0.6) * 255.0) as u8
        })
        .collect()
}

#[derive(Default)]
struct Feel {
    bpm: Option<f32>,
    bpm_confidence: Option<f32>,
    tempo_stability: Option<f32>,
    musical_key: Option<String>,
    camelot: Option<String>,
    key_root: Option<u8>,
    key_major: Option<bool>,
}

/// Tempo and key over the middle of the track. Both are optional: a failure
/// means "unknown", never a failed analysis — loudness and edges are the parts
/// Auto DJ cannot do without.
///
/// `oximedia-mir` also ships a mood detector, but its thresholds saturate on
/// modern masters (every track measured maximum arousal), so energy is derived
/// from loudness, tempo and range instead — see [`TrackAnalysis::energy`].
fn analyze_feel(mono: &[f32], rate: f32) -> Feel {
    let mut feel = Feel::default();
    if mono.is_empty() || rate <= 0.0 {
        return feel;
    }
    let window = centre_window(mono, rate, MIR_WINDOW_SECS);
    if window.len() < rate as usize {
        return feel;
    }

    match oximedia_mir::tempo::TempoDetector::new(rate, MIN_BPM, MAX_BPM).detect(window) {
        Ok(tempo) if tempo.bpm.is_finite() && tempo.bpm > 0.0 => {
            feel.bpm = Some(tempo.bpm);
            feel.bpm_confidence = Some(tempo.confidence);
            feel.tempo_stability = Some(tempo.stability);
        }
        Ok(_) => {}
        Err(e) => tracing::debug!("tempo detection failed: {e}"),
    }

    // 4096 samples ≈ 186 ms at the MIR rate — the usual chroma window.
    match oximedia_mir::key::KeyDetector::new(rate, 4096).detect(window) {
        Ok(key) => {
            let root = key.root;
            let major = key.is_major;
            feel.musical_key = Some(format!(
                "{} {}",
                note_name(root),
                if major { "major" } else { "minor" }
            ));
            feel.camelot = CamelotWheel::from_key(root, major)
                .map(|code| format!("{}{}", code.number, code.letter()));
            feel.key_root = Some(root);
            feel.key_major = Some(major);
        }
        Err(e) => tracing::debug!("key detection failed: {e}"),
    }

    feel
}

/// The middle `secs` of the signal (all of it, when it is shorter).
fn centre_window(mono: &[f32], rate: f32, secs: f32) -> &[f32] {
    let want = (rate * secs) as usize;
    if want == 0 || mono.len() <= want {
        return mono;
    }
    let start = (mono.len() - want) / 2;
    &mono[start..start + want]
}

fn note_name(root: u8) -> &'static str {
    const NAMES: [&str; 12] = [
        "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
    ];
    NAMES[(root % 12) as usize]
}

/// A one-glance summary, for `playerd analyze` and the logs.
pub fn summary(analysis: &TrackAnalysis) -> String {
    let mut lines = vec![format!(
        "  {:.1} LUFS  peak {:.2} dBTP  gain {:+.1} dB  ({} ch @ {} Hz, {})",
        analysis.integrated_lufs,
        20.0 * analysis.true_peak.max(1e-9).log10(),
        analysis.recommended_gain_db,
        analysis.channels,
        analysis.sample_rate,
        ms(analysis.duration_ms),
    )];
    lines.push(format!(
        "  music {} → {}  (lead-in {} ms, tail {} ms)",
        ms(analysis.music_start_ms),
        ms(analysis.music_end_ms),
        analysis.music_start_ms,
        analysis.tail_silence_ms(),
    ));
    let tempo = match (analysis.bpm, analysis.bpm_confidence) {
        (Some(bpm), Some(confidence)) => {
            format!("{bpm:.1} BPM ({:.0}% confident)", confidence * 100.0)
        }
        (Some(bpm), None) => format!("{bpm:.1} BPM"),
        _ => "tempo unknown".to_string(),
    };
    lines.push(format!(
        "  {tempo}  key {}  energy {:.2}  range {:.1} LU",
        analysis
            .musical_key
            .as_deref()
            .map(|k| match analysis.camelot.as_deref() {
                Some(camelot) => format!("{k} ({camelot})"),
                None => k.to_string(),
            })
            .unwrap_or_else(|| "unknown".into()),
        analysis.energy(),
        analysis.loudness_range,
    ));
    lines.join("\n")
}

fn ms(value: u64) -> String {
    let total = value / 1000;
    format!("{}:{:02}", total / 60, total % 60)
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edges_skip_leading_and_trailing_silence() {
        // 10 hops of silence, 30 of music, 20 of silence, at 20 ms each.
        let mut envelope = vec![0.0f32; 10];
        envelope.extend(std::iter::repeat_n(0.8f32, 30));
        envelope.extend(std::iter::repeat_n(0.0f32, 20));
        let (start, end) = music_edges(&envelope, 20);
        assert_eq!(start, 200);
        assert_eq!(end, 800);
    }

    #[test]
    fn gain_backs_off_to_protect_the_peak() {
        // -12 dBTP of headroom leaves room for the whole +6 dB.
        assert!((recommended_gain(-20.0, 0.25, -14.0) - 6.0).abs() < 0.01);
        // A peak at full scale allows none of it: the ceiling is -1 dBTP.
        let capped = recommended_gain(-20.0, 1.0, -14.0);
        assert!((capped - -1.0).abs() < 0.01, "got {capped}");
        // And a -6 dBTP peak allows only +5 of the +6 asked for.
        let partial = recommended_gain(-20.0, 0.5, -14.0);
        assert!((partial - 5.02).abs() < 0.02, "got {partial}");
    }

    fn sample() -> TrackAnalysis {
        TrackAnalysis {
            duration_ms: 1000,
            sample_rate: 44100,
            channels: 2,
            integrated_lufs: -16.0,
            true_peak: 0.9,
            recommended_gain_db: 2.0,
            target_lufs: -14.0,
            music_start_ms: 0,
            music_end_ms: 1000,
            waveform: Vec::new(),
            bpm: None,
            bpm_confidence: None,
            tempo_stability: None,
            musical_key: None,
            camelot: None,
            key_root: None,
            key_major: None,
            loudness_range: 6.0,
            analyzed_at: 0,
        }
    }

    #[test]
    fn energy_reads_loudness_tempo_and_range() {
        let mut analysis = sample();
        // -16 LUFS, unknown tempo, 6 LU: middling on every axis.
        assert!(
            (analysis.energy() - 0.5).abs() < 0.02,
            "{}",
            analysis.energy()
        );

        analysis.integrated_lufs = -8.0;
        analysis.bpm = Some(128.0);
        analysis.loudness_range = 3.0;
        assert!(analysis.energy() > 0.8, "{}", analysis.energy());

        analysis.integrated_lufs = -22.0;
        analysis.bpm = Some(70.0);
        analysis.loudness_range = 14.0;
        assert!(analysis.energy() < 0.15, "{}", analysis.energy());
    }

    #[test]
    fn dance_bpm_folds_octave_errors() {
        let mut analysis = sample();
        analysis.bpm = Some(180.9);
        assert!((analysis.dance_bpm().unwrap() - 90.45).abs() < 0.01);
        analysis.bpm = Some(69.8);
        assert!((analysis.dance_bpm().unwrap() - 139.6).abs() < 0.01);
        analysis.bpm = Some(124.0);
        assert!((analysis.dance_bpm().unwrap() - 124.0).abs() < 0.01);
    }
}
