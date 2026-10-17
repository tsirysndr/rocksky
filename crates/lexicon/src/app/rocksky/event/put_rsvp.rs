//! `app.rocksky.event.putRsvp`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.event.putRsvp";

/// The request body.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    /// Known values: `community.lexicon.calendar.rsvp#going`,
    /// `community.lexicon.calendar.rsvp#interested`,
    /// `community.lexicon.calendar.rsvp#notgoing`.
    pub status: String,
    /// The calendar or music event URI. Format: `at-uri`.
    pub uri: String,
}

/// The response body.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    /// Known values: `community.lexicon.calendar.rsvp#going`,
    /// `community.lexicon.calendar.rsvp#interested`,
    /// `community.lexicon.calendar.rsvp#notgoing`.
    pub status: String,
    /// The RSVP record URI. Format: `at-uri`.
    pub uri: String,
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
        input: Input,
    ) -> impl std::future::Future<Output = Result<Output, Self::Error>> + Send;
}
