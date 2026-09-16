//! `app.rocksky.actor.status`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.actor.status";

/// The current listening status of the actor. Only one can be active at a
/// time (rkey: self).
///
/// Record key: `literal:self`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// When the status expires. Defaults to startedAt plus track duration plus
    /// idle time. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    /// When the track started playing. Format: `datetime`.
    pub started_at: String,
    /// The track currently being played.
    pub track: super::super::super::super::app::rocksky::actor::defs::TrackView,
}
