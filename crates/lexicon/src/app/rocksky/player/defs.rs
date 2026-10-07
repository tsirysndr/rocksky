//! `app.rocksky.player.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.player.defs";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentlyPlayingViewDetailed {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actions: Option<serde_json::Value>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
    #[serde(rename = "currently_playing_type")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub currently_playing_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<serde_json::Value>,
    #[serde(rename = "is_playing")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_playing: Option<bool>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(rename = "progress_ms")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress_ms: Option<i64>,
    #[serde(rename = "repeat_state")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repeat_state: Option<String>,
    #[serde(rename = "shuffle_state")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shuffle_state: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
    /// The title of the currently playing track
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackQueueViewDetailed {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracks: Option<Vec<super::super::super::super::app::rocksky::song::defs::SongViewBasic>>,
}
