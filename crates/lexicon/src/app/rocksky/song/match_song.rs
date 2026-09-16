//! `app.rocksky.song.matchSong`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.song.matchSong";

/// Matches a song against Rocksky’s music database and external metadata
/// providers to resolve the best canonical track, artist, and album
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parameters {
    /// Optional album title — candidates whose album matches it
    /// (case-insensitive) are preferred, so remaster/live/single editions don't
    /// shadow the intended release
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// The artist of the song to retrieve
    pub artist: String,
    /// Optional International Standard Recording Code (ISRC) to anchor the
    /// match
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
    /// Optional MusicBrainz recording ID to anchor the match
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mb_id: Option<String>,
    /// The title of the song to retrieve
    pub title: String,
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
        parameters: Parameters,
    ) -> impl std::future::Future<Output = Result<Output, Self::Error>> + Send;
}
