//! `app.rocksky.artist.getArtistEvents`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.artist.getArtistEvents";

/// Get the music events an artist is billed on, soonest first. Only
/// unexpired events (ending today or later) unless `includePast` is set.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parameters {
    /// Return past events too, most recent first.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_past: Option<bool>,
    /// The maximum number of events to return.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    /// The offset for pagination.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
    /// The URI of the artist to retrieve events for Format: `at-uri`.
    pub uri: String,
}

/// The response body.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub events: Vec<super::super::super::super::app::rocksky::event::defs::EventView>,
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
