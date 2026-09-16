//! `app.rocksky.charts.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.charts.defs";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartsView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrobbles: Option<Vec<ScrobbleViewBasic>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecadeViewBasic {
    /// The first year of the decade, e.g. 1990.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decade: Option<i64>,
    /// The number of scrobbles of music released in this decade.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrobbles: Option<i64>,
    /// The number of distinct albums scrobbled from this decade.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unique_albums: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleViewBasic {
    /// The number of scrobbles on this date.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<i64>,
    /// The date of the scrobble. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrobblerViewBasic {
    /// The URL of the actor's avatar image. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
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
    /// The number of scrobbles in the requested window.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrobbles: Option<i64>,
    /// The number of distinct artists scrobbled in the window.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unique_artists: Option<i64>,
    /// The number of distinct tracks scrobbled in the window.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unique_tracks: Option<i64>,
}
