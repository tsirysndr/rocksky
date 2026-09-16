//! `app.rocksky.scrobble`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.scrobble";

/// A declaration of a scrobble.
///
/// Record key: `tid`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scrobble {
    /// The album of the song.
    pub album: String,
    /// The album art of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<Blob>,
    /// The URL of the album art of the song. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art_url: Option<String>,
    /// The album artist of the song.
    pub album_artist: String,
    /// The Apple Music link of the song. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    /// The artist of the song.
    pub artist: String,
    /// The artists of the song with MusicBrainz IDs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artists: Option<Vec<super::super::super::app::rocksky::artist::defs::ArtistMbid>>,
    /// The composer of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub composer: Option<String>,
    /// The copyright message of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub copyright_message: Option<String>,
    /// The date when the song was created. Format: `datetime`.
    pub created_at: String,
    /// The disc number of the song in the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i64>,
    /// The duration of the song in milliseconds.
    pub duration: i64,
    /// The genre of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// The International Standard Recording Code (ISRC) of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
    /// The label of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// The lyrics of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<String>,
    /// The MusicBrainz ID of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
    /// The release date of the song. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    /// The Spotify link of the song. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    /// The tags of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    /// The Tidal link of the song. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    /// The title of the song.
    pub title: String,
    /// The track number of the song in the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i64>,
    /// Informations about the song
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wiki: Option<String>,
    /// The year the song was released.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    /// The YouTube link of the song. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
}

// The namespace this record also heads.
pub mod create_scrobble;
pub mod defs;
pub mod get_scrobble;
pub mod get_scrobbles;
