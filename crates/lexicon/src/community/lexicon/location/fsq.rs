//! `community.lexicon.location.fsq`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "community.lexicon.location.fsq";

/// A physical location contained in the Foursquare Open Source Places
/// dataset.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fsq {
    /// The unique identifier of a Foursquare POI.
    #[serde(rename = "fsq_place_id")]
    pub fsq_place_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latitude: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub longitude: Option<String>,
    /// The name of the location.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}
