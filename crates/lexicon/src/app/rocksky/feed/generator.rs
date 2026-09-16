//! `app.rocksky.feed.generator`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.feed.generator";

/// Record declaring of the existence of a feed generator, and containing
/// metadata about it. The record can exist in any repository.
///
/// Record key: `tid`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Generator {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<Blob>,
    /// Format: `datetime`.
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Format: `did`.
    pub did: String,
    pub display_name: String,
}
