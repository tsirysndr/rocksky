//! `app.rocksky.album.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.album.defs";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumViewBasic {
    /// The URL of the album art image. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// The artist of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// The URI of the album's artist. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    /// The unique identifier of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The number of times the album has been played.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i64>,
    /// The release date of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    /// The SHA256 hash of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    /// The title of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The number of unique listeners who have played the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unique_listeners: Option<i64>,
    /// The URI of the album. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    /// The year the album was released.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumViewDetailed {
    /// The URL of the album art image. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// The artist of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// The URI of the album's artist. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    /// The unique identifier of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The number of times the album has been played.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i64>,
    /// The release date of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    /// The SHA256 hash of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    /// The title of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracks: Option<Vec<super::super::super::super::app::rocksky::song::defs::SongViewBasic>>,
    /// The number of unique listeners who have played the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unique_listeners: Option<i64>,
    /// The URI of the album. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    /// The year the album was released.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
}
