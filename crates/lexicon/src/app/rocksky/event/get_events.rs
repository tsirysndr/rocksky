//! `app.rocksky.event.getEvents`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.event.getEvents";

/// List indexed music events, soonest first. Without a time window only
/// unexpired events are returned: those ending (or, with no end, starting)
/// today or later, plus undated ones.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parameters {
    /// Only events this artist plays: the artist's AT-URI, id or sha256.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// Only events published by this repo. Format: `did`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    /// Only events that end at or after this time. Defaults to the start of
    /// today (UTC) when neither `to` nor `includePast` is given. Format:
    /// `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    /// Only events whose genre matches (case-insensitive).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// Return past events too, most recent first, instead of upcoming ones.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_past: Option<bool>,
    /// Only events of this kind (concert, festival...).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    /// The maximum number of events to return.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    /// The offset for pagination.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
    /// Only events this DID has RSVP'd to (going or interested). Format: `did`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rsvp_by: Option<String>,
    /// Only events that start at or before this time. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
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
