//! `app.rocksky.actor.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.actor.defs";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistViewBasic {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picture: Option<String>,
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user1_rank: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user2_rank: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityViewBasic {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compatibility_level: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compatibility_percentage: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shared_artists: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_shared_artist_names: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_shared_detailed_artists: Option<Vec<ArtistViewBasic>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user1_artist_count: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user2_artist_count: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NeighbourViewBasic {
    /// The URL of the actor's avatar image. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    /// The number of artists shared with the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shared_artists_count: Option<i64>,
    /// The similarity score with the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub similarity_score: Option<i64>,
    /// The top shared artist names with the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_shared_artist_names: Option<Vec<String>>,
    /// The top shared artist details with the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_shared_artists_details:
        Option<Vec<super::super::super::super::app::rocksky::artist::defs::ArtistViewBasic>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileViewBasic {
    /// The URL of the actor's avatar image. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    /// The date and time when the actor was created. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// The DID of the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    /// The display name of the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// The handle of the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    /// The unique identifier of the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The date and time when the actor was last updated. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileViewDetailed {
    /// The URL of the actor's avatar image. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    /// The date and time when the actor was created. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// The DID of the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    /// The display name of the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// The handle of the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    /// The unique identifier of the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The date and time when the actor was last updated. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackView {
    /// The album name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// URL of the album cover image. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_cover_url: Option<String>,
    /// The primary artist name.
    pub artist: String,
    /// Track duration in milliseconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    /// The name of the track.
    pub name: String,
    /// MusicBrainz recording ID, if available.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recording_mb_id: Option<String>,
    /// Music service source, e.g. 'spotify' or 'listenbrainz'.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// The track's position within its album, if known (>= 1).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i64>,
}
