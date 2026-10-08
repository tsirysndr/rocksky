//! `app.rocksky.event.getEventRsvps`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.event.getEventRsvps";

/// List who responded to an event, most recent first.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parameters {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
    /// Only responses with this status. Known values:
    /// `community.lexicon.calendar.rsvp#going`,
    /// `community.lexicon.calendar.rsvp#interested`,
    /// `community.lexicon.calendar.rsvp#notgoing`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    /// AT-URI of the community.lexicon.calendar.event or
    /// app.rocksky.event.music record. Format: `at-uri`.
    pub uri: String,
}

/// The response body.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub rsvps: Vec<super::super::super::super::app::rocksky::event::defs::RsvpView>,
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
