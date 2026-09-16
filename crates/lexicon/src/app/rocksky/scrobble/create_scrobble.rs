//! `app.rocksky.scrobble.createScrobble`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.scrobble.createScrobble";

/// The request body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    /// The album of the track being scrobbled
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// The URL of the album art for the track Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// The Apple Music link for the track, if available Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    /// The artist of the track being scrobbled
    pub artist: String,
    /// The URL of the artist's picture, if available Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_picture: Option<String>,
    /// The composer of the track, if available
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub composer: Option<String>,
    /// The copyright message for the track, if available
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub copyright_message: Option<String>,
    /// The Deezer link for the track, if available Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deezer_link: Option<String>,
    /// The disc number of the track in the album, if applicable
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i64>,
    /// The duration of the track in milliseconds (e.g., 240000 for 4 minutes)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<i64>,
    /// The International Standard Recording Code (ISRC) of the track, if
    /// available
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
    /// The record label of the track, if available
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// The Last.fm link for the track, if available Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lastfm_link: Option<String>,
    /// The lyrics of the track, if available
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<String>,
    /// The MusicBrainz ID of the track, if available
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mb_id: Option<String>,
    /// The release date of the track, formatted as YYYY-MM-DD
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    /// The Spotify link for the track, if available Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    /// The Tidal link for the track, if available Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    /// The timestamp of the scrobble in seconds since epoch (Unix timestamp)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
    /// The title of the track being scrobbled
    pub title: String,
    /// The track number of the track in the album
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i64>,
    /// The year the track was released
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    /// The Youtube link for the track, if available Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
}

/// The response body.
pub type Output = super::super::super::super::app::rocksky::scrobble::defs::ScrobbleViewBasic;

/// This method, implemented.
///
/// Implementing this ties a handler to the lexicon's own types: one that
/// takes the wrong parameters or answers the wrong shape fails to compile
/// rather than being discovered by a client. The body is hand-written —
/// nothing about it is in the lexicon.
pub trait Handler {
    /// What a failure is reported as.
    type Error;

    fn handle(
        &self,
        input: Input,
    ) -> impl std::future::Future<Output = Result<Output, Self::Error>> + Send;
}
