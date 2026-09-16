//! `app.rocksky.radio`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.radio";

/// A declaration of a radio station.
///
/// Record key: `tid`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Radio {
    /// The date when the radio station was created. Format: `datetime`.
    pub created_at: String,
    /// A description of the radio station.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The genre of the radio station.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// The logo of the radio station.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo: Option<Blob>,
    /// The name of the radio station.
    pub name: String,
    /// The URL of the radio station. Format: `uri`.
    pub url: String,
    /// The website of the radio station. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,
}

// The namespace this record also heads.
pub mod defs;
