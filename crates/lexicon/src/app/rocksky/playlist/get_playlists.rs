//! `app.rocksky.playlist.getPlaylists`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.playlist.getPlaylists";

/// Retrieve a list of playlists
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parameters {
    /// RSQL filter expression, e.g. `name=="Road trip*";track.artist=="Daft
    /// Punk"`. Supports ==, !=, <, <=, >, >=, =in=, =out=, and `;`/`and`,
    /// `,`/`or` combinators, `*` wildcards in string values. Filterable fields:
    /// name, title, description, uri, spotifyLink, tidalLink, appleMusicLink,
    /// createdAt, updatedAt, curatorDid, curatorHandle, curatorName. The
    /// `track.title`, `track.artist`, `track.album` and `track.albumArtist`
    /// selectors match the playlist's contents, returning playlists that
    /// contain a matching track; several `track.*` terms joined with `;` must
    /// all be satisfied by the same track.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter: Option<String>,
    /// The maximum number of playlists to return.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    /// The offset for pagination, used to skip a number of playlists.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
}

/// The response body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playlists:
        Option<Vec<super::super::super::super::app::rocksky::playlist::defs::PlaylistViewBasic>>,
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
