//! `app.rocksky.scrobble.getScrobbles`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.scrobble.getScrobbles";

/// Get scrobbles all scrobbles
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parameters {
    /// The DID or handle of the actor Format: `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    /// RSQL filter expression, e.g. `track.artist=="Daft
    /// Punk";date=ge=2025-01-01`. Supports ==, !=, <, <=, >, >=, =in=, =out=,
    /// and `;`/`and`, `,`/`or` combinators, `*` wildcards in string values.
    /// Filterable fields: uri, date, timestamp, title, artist, album,
    /// track.title, track.artist, track.album, track.albumArtist, track.genre,
    /// track.duration, track.isrc, track.mbId, user.did, user.handle,
    /// user.displayName, artist.name, artist.genres
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter: Option<String>,
    /// If true, only return scrobbles from actors the viewer is following.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub following: Option<bool>,
    /// The maximum number of scrobbles to return
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    /// The offset for pagination
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
}

/// The response body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrobbles:
        Option<Vec<super::super::super::super::app::rocksky::scrobble::defs::ScrobbleViewBasic>>,
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
