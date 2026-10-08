//! `community.lexicon.location.geo`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "community.lexicon.location.geo";

/// A physical location in the form of a WGS84 coordinate.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Geo {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub altitude: Option<String>,
    pub latitude: String,
    pub longitude: String,
    /// The name of the location.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}
