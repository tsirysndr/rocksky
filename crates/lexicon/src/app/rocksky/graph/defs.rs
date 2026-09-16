//! `app.rocksky.graph.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.graph.defs";

/// indicates that a handle or DID could not be resolved
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotFoundActor {
    /// Format: `at-identifier`.
    pub actor: String,
    pub not_found: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relationship {
    /// Format: `did`.
    pub did: String,
    /// if the actor is followed by this DID, contains the AT-URI of the follow
    /// record Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub followed_by: Option<String>,
    /// if the actor follows this DID, this is the AT-URI of the follow record
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub following: Option<String>,
}
