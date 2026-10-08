//! `app.rocksky.event.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.event.defs";

/// An artist on an event lineup, linked to the Rocksky artist when one was
/// resolved.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistView {
    /// The unique identifier of the linked Rocksky artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// MusicBrainz artist id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
    /// The artist name as billed on the event.
    pub name: String,
    /// The picture of the linked artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picture: Option<String>,
    /// The artist's billing on this event. Known values: `headliner`,
    /// `support`, `opener`, `dj`, `special-guest`, `performer`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    /// The SHA256 hash of the linked artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    /// The stage the artist plays on.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    /// When this artist's set starts. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub starts_at: Option<String>,
    /// AT-URI of the linked artist. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

/// A music event: the calendar event merged with its
/// app.rocksky.event.music annotation.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventView {
    /// The lineup, in billing order.
    pub artists: Vec<ArtistView>,
    /// CID of the calendar event record revision that was indexed. Format:
    /// `cid`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cid: Option<String>,
    /// When the event record was created. Format: `datetime`.
    pub created_at: String,
    /// The description of the event.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// When the event ends. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_ids: Option<super::super::super::super::app::rocksky::event::music::ExternalIds>,
    /// The main genre of the event.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// The unique identifier of the event.
    pub id: String,
    /// Poster or banner image of the event. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    /// What sort of music event this is (concert, festival...). Known values:
    /// `concert`, `festival`, `club-night`, `dj-set`, `livestream`,
    /// `release-party`, `listening-party`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    /// Where the event takes place.
    pub locations: Vec<LocationView>,
    /// The attendance mode, as a community.lexicon.calendar.event#mode token.
    /// Known values: `community.lexicon.calendar.event#inperson`,
    /// `community.lexicon.calendar.event#virtual`,
    /// `community.lexicon.calendar.event#hybrid`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    /// CID of the music record revision that was indexed. Format: `cid`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub music_cid: Option<String>,
    /// AT-URI of the app.rocksky.event.music record. Format: `at-uri`.
    pub music_uri: String,
    /// The name of the event.
    pub name: String,
    /// The avatar of the publisher. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub organizer_avatar_url: Option<String>,
    /// The DID of the repo that published the event. Format: `did`.
    pub organizer_did: String,
    /// The handle of the publisher.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub organizer_handle: Option<String>,
    /// The display name of the publisher.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub organizer_name: Option<String>,
    pub rsvp_counts: RsvpCounts,
    /// When the event starts. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub starts_at: Option<String>,
    /// The event status, as a community.lexicon.calendar.event#status token.
    /// Known values: `community.lexicon.calendar.event#planned`,
    /// `community.lexicon.calendar.event#scheduled`,
    /// `community.lexicon.calendar.event#rescheduled`,
    /// `community.lexicon.calendar.event#cancelled`,
    /// `community.lexicon.calendar.event#postponed`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    /// Where tickets can be bought. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tickets_url: Option<String>,
    /// When the event was last indexed. Format: `datetime`.
    pub updated_at: String,
    /// AT-URI of the community.lexicon.calendar.event record. Format: `at-uri`.
    pub uri: String,
    /// Links associated with the event.
    pub uris: Vec<UriView>,
    /// The authenticated viewer's RSVP, as a community.lexicon.calendar.rsvp
    /// status token. Absent when not authenticated or when the viewer has not
    /// responded. Known values: `community.lexicon.calendar.rsvp#going`,
    /// `community.lexicon.calendar.rsvp#interested`,
    /// `community.lexicon.calendar.rsvp#notgoing`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub viewer_rsvp: Option<String>,
}

/// One entry of the calendar event's locations, flattened: `type` says
/// which community.lexicon.location shape it came from, and only the fields
/// of that shape are set.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub altitude: Option<String>,
    /// ISO 3166 country code.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    /// Foursquare Open Source Places id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fsq_place_id: Option<String>,
    /// H3 encoded location.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub h3: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latitude: Option<String>,
    /// City or town.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locality: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub longitude: Option<String>,
    /// The name of the location (venue name).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub postal_code: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub street: Option<String>,
    /// Known values: `community.lexicon.location.address`,
    /// `community.lexicon.location.geo`, `community.lexicon.location.fsq`,
    /// `community.lexicon.location.hthree`,
    /// `community.lexicon.calendar.event#uri`.
    pub type_: String,
    /// A URL standing in for the location (online events). Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RsvpCounts {
    pub going: i64,
    pub interested: i64,
    pub not_going: i64,
}

/// A community.lexicon.calendar.rsvp on an event, with its author.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RsvpView {
    /// Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    /// Format: `cid`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cid: Option<String>,
    /// Format: `datetime`.
    pub created_at: String,
    /// Format: `did`.
    pub did: String,
    pub display_name: String,
    pub handle: String,
    /// Known values: `community.lexicon.calendar.rsvp#going`,
    /// `community.lexicon.calendar.rsvp#interested`,
    /// `community.lexicon.calendar.rsvp#notgoing`.
    pub status: String,
    /// AT-URI of the rsvp record. Format: `at-uri`.
    pub uri: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UriView {
    /// The display name of the URI.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Format: `uri`.
    pub uri: String,
}
