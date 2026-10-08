//! `community.lexicon.calendar.rsvp`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "community.lexicon.calendar.rsvp";

/// Going to the event
pub const GOING: &str = "community.lexicon.calendar.rsvp#going";

/// Interested in the event
pub const INTERESTED: &str = "community.lexicon.calendar.rsvp#interested";

/// An RSVP for an event.
///
/// Record key: `tid`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rsvp {
    /// Known values: `community.lexicon.calendar.rsvp#interested`,
    /// `community.lexicon.calendar.rsvp#going`,
    /// `community.lexicon.calendar.rsvp#notgoing`.
    pub status: String,
    pub subject: super::super::super::super::com::atproto::repo::strong_ref::StrongRef,
}

/// Not going to the event
pub const NOTGOING: &str = "community.lexicon.calendar.rsvp#notgoing";
