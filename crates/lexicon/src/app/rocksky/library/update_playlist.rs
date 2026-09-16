//! `app.rocksky.library.updatePlaylist`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.library.updatePlaylist";

/// The request body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    /// New playlist comment.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    /// New playlist name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The playlist id to update.
    pub playlist_id: String,
    /// A song id to add to the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub song_id_to_add: Option<String>,
    /// A track index to remove from the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub song_index_to_remove: Option<i64>,
}

/// The response body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {}

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
