//! `app.rocksky.event.music`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.event.music";

/// An artist on the lineup.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artist {
    /// MusicBrainz artist id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
    /// The artist name as billed.
    pub name: String,
    /// The artist's billing on this event. Known values: `headliner`,
    /// `support`, `opener`, `dj`, `special-guest`, `performer`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    /// The stage the artist plays on, for multi-stage events such as festivals.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    /// When this artist's set starts. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub starts_at: Option<String>,
    /// AT-URI of the app.rocksky.artist record, when the artist is known to
    /// Rocksky. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

/// Identifiers of the event on other services.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalIds {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bandsintown: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dice: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub eventbrite: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resident_advisor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub setlistfm: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub songkick: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ticketmaster: Option<String>,
}

/// Marks a community.lexicon.calendar.event as a music event (concert,
/// festival, club night...) and links it to the artists performing. The
/// calendar event carries the name, dates and venue; this record carries
/// what is specific to music. Rocksky only indexes calendar events that
/// have one of these attached.
///
/// Record key: `tid`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Music {
    /// The lineup, in billing order.
    pub artists: Vec<Artist>,
    /// Client-declared timestamp when this record was created. Format:
    /// `datetime`.
    pub created_at: String,
    /// Identifiers of the same event on ticketing and event-listing services.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_ids: Option<ExternalIds>,
    /// The main genre of the event.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// Poster or banner image of the event. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    /// What sort of music event this is. Known values: `concert`, `festival`,
    /// `club-night`, `dj-set`, `livestream`, `release-party`,
    /// `listening-party`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    /// Strong reference (AT-URI + CID) to the community.lexicon.calendar.event
    /// record this annotates.
    pub subject: super::super::super::super::com::atproto::repo::strong_ref::StrongRef,
    /// Free-form tags (sub-genres, scene, tour name...).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    /// Where tickets can be bought. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tickets_url: Option<String>,
}
