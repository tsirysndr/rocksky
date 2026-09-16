//! `app.rocksky.song.getSongs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.song.getSongs";

/// Get songs
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parameters {
    /// RSQL filter expression, e.g. `artist=="Daft Punk";duration=gt=200000`.
    /// Supports ==, !=, <, <=, >, >=, =in=, =out=, and `;`/`and`, `,`/`or`
    /// combinators, `*` wildcards in string values. Filterable fields: title,
    /// artist, album, albumArtist, genre, composer, label, duration,
    /// trackNumber, discNumber, mbId, isrc, sha256, uri, albumUri, artistUri,
    /// createdAt
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter: Option<String>,
    /// The genre to filter artists by
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// Filter songs by International Standard Recording Code (ISRC)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
    /// The maximum number of songs to return
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    /// Filter songs by MusicBrainz ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
    /// The offset for pagination
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
    /// Filter songs by Spotify track ID (resolved internally to the Spotify
    /// track URL)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spotify_id: Option<String>,
}

/// The response body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub songs: Option<Vec<super::super::super::super::app::rocksky::song::defs::SongViewBasic>>,
}

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
        parameters: Parameters,
    ) -> impl std::future::Future<Output = Result<Output, Self::Error>> + Send;
}
