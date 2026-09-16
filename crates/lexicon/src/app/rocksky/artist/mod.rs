//! `app.rocksky.artist`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.artist";

/// A declaration of an artist.
///
/// Record key: `tid`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artist {
    /// The biography of the artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    /// The birth date of the artist. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub born: Option<String>,
    /// The birth place of the artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub born_in: Option<String>,
    /// The date when the artist was created. Format: `datetime`.
    pub created_at: String,
    /// The death date of the artist. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub died: Option<String>,
    /// The name of the artist.
    pub name: String,
    /// The picture of the artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picture: Option<Blob>,
    /// The URL of the picture of the artist. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picture_url: Option<String>,
    /// The tags of the artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

// The namespace this record also heads.
pub mod defs;
pub mod get_artist;
pub mod get_artist_albums;
pub mod get_artist_listeners;
pub mod get_artist_recent_listeners;
pub mod get_artist_tracks;
pub mod get_artists;
