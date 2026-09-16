//! `app.rocksky.mirror.putMirrorSource`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.mirror.putMirrorSource";

/// The request body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    /// API key / token to be encrypted at rest. Omit to leave the existing key
    /// unchanged. Pass an empty string to clear it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// Enable or disable mirroring for this provider.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    /// External username (Last.fm / ListenBrainz). Required when enabling those
    /// providers. Ignored for Teal.fm.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_username: Option<String>,
    /// One of: lastfm, listenbrainz, tealfm
    pub provider: String,
    /// Enable or disable mirroring Rocksky scrobbles out to this provider.
    /// teal.fm only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub push_enabled: Option<bool>,
}

/// The response body.
pub type Output = super::super::super::super::app::rocksky::mirror::defs::MirrorSourceView;

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
