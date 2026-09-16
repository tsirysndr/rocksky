//! `app.rocksky.rockbox.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.rockbox.defs";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossfadeSettings {
    /// Fade-in delay in ms
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fade_in_delay: Option<i64>,
    /// Fade-in duration in ms
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fade_in_duration: Option<i64>,
    /// Fade-out delay in ms
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fade_out_delay: Option<i64>,
    /// Fade-out duration in ms
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fade_out_duration: Option<i64>,
    /// Fade-out mix mode: crossfade | mix
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fade_out_mix_mode: Option<String>,
    /// Crossfade mode: disabled | enabled | shuffle | albumChange | trackChange
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqualizerBand {
    /// Center frequency in Hz
    pub frequency: i64,
    /// Band gain in tenths of dB (e.g. 30 = +3.0 dB)
    pub gain: i64,
    /// Q factor × 10 (e.g. 7 = Q 0.7)
    pub q: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqualizerSettings {
    /// Up to 10 EQ bands
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bands: Option<Vec<EqualizerBand>>,
    /// Whether the equalizer is enabled
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    /// Pre-amplification cut in tenths of dB applied before EQ bands (e.g. -60
    /// = -6.0 dB)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub precut: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayGainSettings {
    /// Replay gain mode: disabled | track | album | trackIfShuffling
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    /// Pre-amplification in tenths of dB (e.g. 15 = +1.5 dB)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preamp: Option<i64>,
    /// Whether to prevent clipping by reducing volume
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prevent_clipping: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    /// When this settings record was first created. Format: `datetime`.
    pub created_at: String,
    /// Crossfade settings
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crossfade: Option<CrossfadeSettings>,
    /// Equalizer settings
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub equalizer: Option<EqualizerSettings>,
    /// Replay gain settings
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replay_gain: Option<ReplayGainSettings>,
    /// Tone control settings (bass, treble, balance, channels)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tone: Option<ToneSettings>,
    /// When this settings record was last updated. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToneSettings {
    /// Left/right balance. Negative = left, positive = right
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub balance: Option<i64>,
    /// Bass level in dB
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bass: Option<i64>,
    /// Channel configuration: stereo | mono | monoLeft | monoRight | karaoke |
    /// wide
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channels: Option<String>,
    /// Treble level in dB
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub treble: Option<i64>,
}
