//! `app.rocksky.song.createSong`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.song.createSong";

/// The request body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    /// The album of the song, if applicable
    pub album: String,
    /// The URL of the album art for the song Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// The album artist of the song, if different from the main artist
    pub album_artist: String,
    /// The artist of the song
    pub artist: String,
    /// The disc number of the song in the album, if applicable
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i64>,
    /// The duration of the song in milliseconds
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<i64>,
    /// The International Standard Recording Code (ISRC) of the song, if
    /// available
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
    /// The lyrics of the song, if available
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<String>,
    /// The MusicBrainz ID of the song, if available
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mb_id: Option<String>,
    /// The release date of the song, formatted as YYYY-MM-DD
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    /// The title of the song
    pub title: String,
    /// The track number of the song in the album, if applicable
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i64>,
    /// The year the song was released
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
}

/// The response body.
pub type Output = super::super::super::super::app::rocksky::song::defs::SongViewDetailed;

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
