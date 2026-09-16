//! `app.rocksky.equalizer.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.equalizer.defs";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetView {
    /// Up to 10 EQ bands
    pub bands: Vec<super::super::super::super::app::rocksky::rockbox::defs::EqualizerBand>,
    /// When this preset was first created. Format: `datetime`.
    pub created_at: String,
    /// Display name of the preset.
    pub name: String,
    /// Pre-amplification cut in tenths of dB applied before EQ bands (e.g. -60
    /// = -6.0 dB)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub precut: Option<i64>,
    /// Record key: the preset name slugified (lower case, dashes, no spaces).
    pub rkey: String,
    /// When this preset was last updated. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// AT URI of the preset record. Format: `at-uri`.
    pub uri: String,
}
