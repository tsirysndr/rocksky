//! `app.rocksky.mirror.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.mirror.defs";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorSourceView {
    /// Whether scrobbles from this source are being mirrored into Rocksky.
    pub enabled: bool,
    /// Username on the external service (Last.fm / ListenBrainz). Null for
    /// Teal.fm.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_username: Option<String>,
    /// True when an API key is stored. Last.fm/ListenBrainz only; always false
    /// for Teal.fm.
    pub has_credentials: bool,
    /// The last time the mirror process successfully polled this source.
    /// Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_polled_at: Option<String>,
    /// Watermark — scrobbles from the external service older than this are
    /// skipped. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_scrobble_seen_at: Option<String>,
    /// One of: lastfm, listenbrainz, tealfm
    pub provider: String,
    /// Whether Rocksky scrobbles are mirrored out to this source. Enabled
    /// unless the user turned it off. teal.fm only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub push_enabled: Option<bool>,
}
