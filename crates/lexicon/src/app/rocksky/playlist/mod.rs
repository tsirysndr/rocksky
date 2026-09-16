//! `app.rocksky.playlist`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.playlist";

/// A declaration of a playlist.
///
/// Record key: `tid`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    /// The Apple Music link of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    /// The date the playlist was created. Format: `datetime`.
    pub created_at: String,
    /// The playlist description.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The name of the playlist.
    pub name: String,
    /// The picture of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picture: Option<Blob>,
    /// The URL of the picture of the artist. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picture_url: Option<String>,
    /// The Spotify link of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    /// The Tidal link of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    /// The YouTube link of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
}

// The namespace this record also heads.
pub mod add_songs;
pub mod create_playlist;
pub mod defs;
pub mod get_playlist;
pub mod get_playlists;
pub mod insert_directory;
pub mod insert_files;
pub mod remove_playlist;
pub mod remove_track;
pub mod song;
pub mod start_playlist;
pub mod update_playlist;
