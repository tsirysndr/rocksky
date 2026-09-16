//! `app.rocksky.equalizer`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.equalizer";

/// A saved equalizer preset. The rkey is the preset name slugified: lower
/// case, dashes, no spaces (e.g. "Bass Boost" -> "bass-boost").
///
/// Record key: `any`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Equalizer {
    /// Up to 10 EQ bands
    pub bands: Vec<super::super::super::app::rocksky::rockbox::defs::EqualizerBand>,
    /// When this preset was first created. Format: `datetime`.
    pub created_at: String,
    /// Display name of the preset.
    pub name: String,
    /// Pre-amplification cut in tenths of dB applied before EQ bands (e.g. -60
    /// = -6.0 dB)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub precut: Option<i64>,
    /// When this preset was last updated. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

// The namespace this record also heads.
pub mod defs;
pub mod delete_preset;
pub mod list_presets;
pub mod put_preset;
