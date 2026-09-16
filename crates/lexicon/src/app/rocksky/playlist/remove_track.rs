//! `app.rocksky.playlist.removeTrack`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.playlist.removeTrack";

/// Remove one track from a playlist. Deletes the app.rocksky.playlist.song
/// record that put it there, which only the repo that added it can do.
/// Prefer `index`: a song can sit in a playlist more than once, and
/// `songUri` alone cannot say which copy to drop.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parameters {
    /// 0-based position of the entry to remove, in the order getPlaylist
    /// returns.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub index: Option<i64>,
    /// The URI of the app.rocksky.song record to remove. Removes every copy of
    /// it; pass `index` instead to remove one. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub song_uri: Option<String>,
    /// The URI of the playlist to remove the track from Format: `at-uri`.
    pub uri: String,
}
