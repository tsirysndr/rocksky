//! `app.bsky.actor.profile`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.bsky.actor.profile";

/// Self-label values, specific to the Bluesky application, on the overall
/// account.
///
/// An open union: a variant this build does not know about is kept as raw
/// JSON rather than rejected.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ProfileLabels {
    SelfLabels(serde_json::Value),
    /// A `$type` this build does not model.
    Other(serde_json::Value),
}

/// A declaration of a Bluesky account profile.
///
/// Record key: `literal:self`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    /// Small image to be displayed next to posts from account. AKA, 'profile
    /// picture'
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<Blob>,
    /// Larger horizontal image to display behind profile view.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub banner: Option<Blob>,
    /// Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// Free-form profile description text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub joined_via_starter_pack:
        Option<super::super::super::super::com::atproto::repo::strong_ref::StrongRef>,
    /// Self-label values, specific to the Bluesky application, on the overall
    /// account.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub labels: Option<ProfileLabels>,
}
