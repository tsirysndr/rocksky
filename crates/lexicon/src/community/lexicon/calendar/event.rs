//! `community.lexicon.calendar.event`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "community.lexicon.calendar.event";

/// The event has been cancelled.
pub const CANCELLED: &str = "community.lexicon.calendar.event#cancelled";

/// A hybrid event that takes place both online and offline.
pub const HYBRID: &str = "community.lexicon.calendar.event#hybrid";

/// An in-person event that takes place offline.
pub const INPERSON: &str = "community.lexicon.calendar.event#inperson";

/// One of several `EventLocationsItem` shapes.
///
/// An open union: a variant this build does not know about is kept as raw
/// JSON rather than rejected.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EventLocationsItem {
    Uri(Uri),
    Address(super::super::super::super::community::lexicon::location::address::Address),
    Fsq(super::super::super::super::community::lexicon::location::fsq::Fsq),
    Geo(super::super::super::super::community::lexicon::location::geo::Geo),
    Hthree(super::super::super::super::community::lexicon::location::hthree::Hthree),
    /// A `$type` this build does not model.
    Other(serde_json::Value),
}

/// A calendar event.
///
/// Record key: `tid`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    /// Client-declared timestamp when the event was created. Format:
    /// `datetime`.
    pub created_at: String,
    /// The description of the event.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Client-declared timestamp when the event ends. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<String>,
    /// The locations where the event takes place.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locations: Option<Vec<EventLocationsItem>>,
    /// The attendance mode of the event.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<Mode>,
    /// The name of the event.
    pub name: String,
    /// Whether a response is requested from attendees.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rsvp_expected: Option<bool>,
    /// Client-declared timestamp when the event starts. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub starts_at: Option<String>,
    /// The status of the event.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    /// URIs associated with the event.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uris: Option<Vec<Uri>>,
}

/// The mode of the event.
pub type Mode = String;

/// The event has been created, but not finalized.
pub const PLANNED: &str = "community.lexicon.calendar.event#planned";

/// The event has been postponed and a new start date has not been set.
pub const POSTPONED: &str = "community.lexicon.calendar.event#postponed";

/// The event has been rescheduled.
pub const RESCHEDULED: &str = "community.lexicon.calendar.event#rescheduled";

/// The event has been created and scheduled.
pub const SCHEDULED: &str = "community.lexicon.calendar.event#scheduled";

/// The status of the event.
pub type Status = String;

/// A URI associated with the event.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Uri {
    /// The display name of the URI.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Format: `uri`.
    pub uri: String,
}

/// A virtual event that takes place online.
pub const VIRTUAL: &str = "community.lexicon.calendar.event#virtual";
