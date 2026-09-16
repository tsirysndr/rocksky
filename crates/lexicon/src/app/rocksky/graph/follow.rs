//! `app.rocksky.graph.follow`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.graph.follow";

/// Record declaring a social 'follow' relationship of another account.
///
/// Record key: `tid`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Follow {
    /// Format: `datetime`.
    pub created_at: String,
    /// Format: `did`.
    pub subject: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub via: Option<super::super::super::super::com::atproto::repo::strong_ref::StrongRef>,
}
