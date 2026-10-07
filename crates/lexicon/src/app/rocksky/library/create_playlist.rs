//! `app.rocksky.library.createPlaylist`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.library.createPlaylist";

/// The request body.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    /// The playlist name.
    pub name: String,
}

/// The response body.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    /// Non-fatal AT Protocol playlist mirror error, when available.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub atproto_error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub open_subsonic: Option<bool>,
    /// Unmodified OpenSubsonic playlist payload from Navidrome. Its
    /// provider-defined fields are preserved.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playlist: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub type_: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

/// This method, implemented.
///
/// Implementing this ties a handler to the lexicon's own types: one that
/// takes the wrong parameters or answers the wrong shape fails to compile
/// rather than being discovered by a client. The body is hand-written —
/// nothing about it is in the lexicon.
pub trait Handler {
    /// What a failure is reported as.
    type Error;

    fn handle(
        &self,
        input: Input,
    ) -> impl std::future::Future<Output = Result<Output, Self::Error>> + Send;
}
