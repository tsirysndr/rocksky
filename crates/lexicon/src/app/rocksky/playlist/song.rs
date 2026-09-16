//! `app.rocksky.playlist.song`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.playlist.song";

/// A song entry in a playlist. Holds a strong reference to the playlist it
/// belongs to, a strong reference to the song record itself, and a
/// denormalized copy of the song metadata so the entry can be rendered
/// without dereferencing the song.
///
/// Record key: `tid`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    /// The date and time the song was added to the playlist. Format:
    /// `datetime`.
    pub added_at: String,
    /// The album the song belongs to.
    pub album: String,
    /// The URL of the album art of the song. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art_url: Option<String>,
    /// The album artist of the song.
    pub album_artist: String,
    /// The artist of the song.
    pub artist: String,
    /// The duration of the song in milliseconds.
    pub duration: i64,
    /// Strong reference (AT-URI + CID) to the parent app.rocksky.playlist
    /// record.
    pub playlist: super::super::super::super::com::atproto::repo::strong_ref::StrongRef,
    /// Strong reference (AT-URI + CID) to the app.rocksky.song record this
    /// entry points at.
    pub song: super::super::super::super::com::atproto::repo::strong_ref::StrongRef,
    /// The title of the song.
    pub title: String,
}
