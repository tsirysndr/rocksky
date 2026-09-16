//! `app.rocksky.album`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.album";

/// A declaration of an album.
///
/// Record key: `tid`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    /// The album art of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<Blob>,
    /// The URL of the album art of the album. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art_url: Option<String>,
    /// The Apple Music link of the album. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    /// The artist of the album.
    pub artist: String,
    /// The date and time when the album was created. Format: `datetime`.
    pub created_at: String,
    /// The duration of the album in milliseconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<i64>,
    /// The genre of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// The release date of the album. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    /// The Spotify link of the album. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    /// The tags of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    /// The tidal link of the album. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    /// The title of the album.
    pub title: String,
    /// The year the album was released.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    /// The YouTube link of the album. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
}

// The namespace this record also heads.
pub mod defs;
pub mod get_album;
pub mod get_album_tracks;
pub mod get_albums;
