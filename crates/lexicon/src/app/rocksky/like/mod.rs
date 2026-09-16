//! `app.rocksky.like`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.like";

/// A declaration of a like.
///
/// Record key: `tid`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Like {
    /// The date when the like was created. Format: `datetime`.
    pub created_at: String,
    pub subject: super::super::super::com::atproto::repo::strong_ref::StrongRef,
}

// The namespace this record also heads.
pub mod dislike_shout;
pub mod dislike_song;
pub mod like_shout;
pub mod like_song;
