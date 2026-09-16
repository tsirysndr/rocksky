//! `app.rocksky.shout`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.shout";

/// A declaration of a shout.
///
/// Record key: `tid`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shout {
    /// The date when the shout was created. Format: `datetime`.
    pub created_at: String,
    /// Mentions of other actors within the message, anchored to UTF-8 byte
    /// ranges.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub facets: Option<Vec<super::super::super::app::rocksky::shout::defs::Mention>>,
    /// An attached GIF, sticker, or clip (e.g. from KLIPY).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gif: Option<super::super::super::app::rocksky::shout::defs::Gif>,
    /// The message of the shout. Optional when a gif/sticker/clip is attached.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<super::super::super::com::atproto::repo::strong_ref::StrongRef>,
    pub subject: super::super::super::com::atproto::repo::strong_ref::StrongRef,
}

// The namespace this record also heads.
pub mod create_shout;
pub mod defs;
pub mod get_album_shouts;
pub mod get_artist_shouts;
pub mod get_profile_shouts;
pub mod get_shout_replies;
pub mod get_track_shouts;
pub mod remove_shout;
pub mod reply_shout;
pub mod report_shout;
