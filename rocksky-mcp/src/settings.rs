//! The saved, cross-device audio settings, and the saved EQ presets.
//!
//! `app.rocksky.rockbox.audio.settings` is the record every Rocksky player
//! starts from; `app.rocksky.equalizer` records are the named presets. Both are
//! fetched through the SDK's AppView client (see [`crate::rocksky`]); this
//! module holds the shapes and the naming rules around them.
//!
//! The server only ever *reads* them — the setters in [`crate::tools::audio`]
//! push to a running player over the remote protocol instead, which is
//! immediate and does not rewrite what the listener saved.
//!
//! Wire units are rockbox's: EQ gain and precut in tenths of a dB (precut ≤ 0),
//! Q ×10, tone in whole dB, fade times in ms, ReplayGain preamp in tenths of a
//! dB.

use anyhow::{bail, Result};
use rocksky_sdk::EqualizerPresetView;
use serde::{Deserialize, Serialize};

/// The 10 EQ bands, low to high — the same centre frequencies rockbox uses,
/// and the order `set_equalizer` expects `bands_db` in.
pub const EQ_BAND_FREQUENCIES: [i32; 10] = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

#[derive(Deserialize, Serialize, Clone, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct AudioSettingsView {
    pub equalizer: Option<LexEqualizer>,
    pub tone: Option<LexTone>,
    pub crossfade: Option<LexCrossfade>,
    pub replay_gain: Option<LexReplayGain>,
    pub updated_at: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LexEqualizer {
    pub enabled: Option<bool>,
    pub precut: Option<i32>,
    pub bands: Option<Vec<LexEqBand>>,
}

#[derive(Deserialize, Serialize, Clone, PartialEq)]
pub struct LexEqBand {
    pub frequency: i32,
    pub gain: i32,
    pub q: i32,
}

#[derive(Deserialize, Serialize, Clone, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LexTone {
    pub bass: Option<i32>,
    pub treble: Option<i32>,
    pub balance: Option<i32>,
    pub channels: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LexCrossfade {
    pub mode: Option<String>,
    pub fade_in_delay: Option<u64>,
    pub fade_in_duration: Option<u64>,
    pub fade_out_delay: Option<u64>,
    pub fade_out_duration: Option<u64>,
    pub fade_out_mix_mode: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LexReplayGain {
    pub mode: Option<String>,
    pub preamp: Option<i32>,
    pub prevent_clipping: Option<bool>,
}

/// How a preset was named: an AT URI to one specific record, or a plain
/// name/rkey of one of the caller's own.
pub enum PresetSpec {
    Record { repo: String, rkey: String },
    Named(String),
}

impl PresetSpec {
    pub fn parse(spec: &str) -> Result<Self> {
        let Some(rest) = spec.strip_prefix("at://") else {
            return Ok(PresetSpec::Named(spec.to_string()));
        };
        let mut parts = rest.split('/');
        let repo = parts.next().unwrap_or_default();
        let collection = parts.next().unwrap_or_default();
        let rkey = parts.next().unwrap_or_default();
        if repo.is_empty() || rkey.is_empty() || parts.next().is_some() {
            bail!(
                "invalid equalizer preset URI {spec:?}: expected at://<did-or-handle>/app.rocksky.equalizer/<rkey>"
            );
        }
        if collection != "app.rocksky.equalizer" {
            bail!(
                "equalizer preset URI {spec:?} points at collection {collection:?}, expected app.rocksky.equalizer"
            );
        }
        Ok(PresetSpec::Record {
            repo: repo.to_string(),
            rkey: rkey.to_string(),
        })
    }
}

/// Preset rkeys are the display name slugified (same rule as putPreset).
fn slugify(name: &str) -> String {
    name.trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
}

/// Pick the preset a [`PresetSpec`] names: by rkey for an AT URI, by rkey or
/// display name (case-insensitively) for a plain name.
pub fn find_preset<'a>(
    presets: &'a [EqualizerPresetView],
    spec: &PresetSpec,
) -> Result<&'a EqualizerPresetView> {
    let found = match spec {
        PresetSpec::Record { rkey, .. } => presets.iter().find(|p| &p.rkey == rkey),
        PresetSpec::Named(name) => presets
            .iter()
            .find(|p| p.rkey == slugify(name) || p.name.eq_ignore_ascii_case(name.trim())),
    };
    found.ok_or_else(|| {
        let available = presets
            .iter()
            .map(|p| p.name.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        anyhow::anyhow!(
            "equalizer preset not found (available: {})",
            if available.is_empty() {
                "none"
            } else {
                available.as_str()
            }
        )
    })
}
