//! `app.rocksky.playlist.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.playlist.defs";

/// Basic view of a playlist, including its metadata
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistViewBasic {
    /// The URL of the cover image for the playlist. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_image_url: Option<String>,
    /// The date and time when the playlist was created. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// The URL of the avatar image of the curator. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_avatar_url: Option<String>,
    /// The DID of the curator of the playlist. Format: `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_did: Option<String>,
    /// The handle of the curator of the playlist. Format: `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_handle: Option<String>,
    /// The name of the curator of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_name: Option<String>,
    /// A description of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The unique identifier of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The title of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Album-art URLs of up to four of the playlist's tracks, for rendering a
    /// cover mosaic when the playlist has no picture of its own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_arts: Option<Vec<String>>,
    /// The number of tracks in the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_count: Option<i64>,
    /// The URI of the playlist. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

/// Detailed view of a playlist, including its tracks and metadata
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistViewDetailed {
    /// The URL of the cover image for the playlist. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_image_url: Option<String>,
    /// The date and time when the playlist was created. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// The URL of the avatar image of the curator. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_avatar_url: Option<String>,
    /// The DID of the curator of the playlist. Format: `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_did: Option<String>,
    /// The handle of the curator of the playlist. Format: `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_handle: Option<String>,
    /// The name of the curator of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_name: Option<String>,
    /// A description of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The unique identifier of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The title of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// A list of tracks in the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracks: Option<Vec<super::super::super::super::app::rocksky::song::defs::SongViewBasic>>,
    /// The URI of the playlist. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}
