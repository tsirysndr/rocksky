//! `community.lexicon.location.hthree`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "community.lexicon.location.hthree";

/// A physical location in the form of a H3 encoded location.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hthree {
    /// The name of the location.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The h3 encoded location.
    pub value: String,
}
