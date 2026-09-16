//! `app.rocksky.rockbox.audio.settings`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.rockbox.audio.settings";

/// A user's Rockbox audio settings. One record per user (rkey: self).
///
/// Record key: `literal:self`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// When this settings record was first created. Format: `datetime`.
    pub created_at: String,
    /// Crossfade settings
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crossfade:
        Option<super::super::super::super::super::app::rocksky::rockbox::defs::CrossfadeSettings>,
    /// Equalizer settings
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub equalizer:
        Option<super::super::super::super::super::app::rocksky::rockbox::defs::EqualizerSettings>,
    /// Replay gain settings
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replay_gain:
        Option<super::super::super::super::super::app::rocksky::rockbox::defs::ReplayGainSettings>,
    /// Tone control settings (bass, treble, balance, channels)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tone: Option<super::super::super::super::super::app::rocksky::rockbox::defs::ToneSettings>,
    /// When this settings record was last updated. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}
