//! `app.rocksky.playlist.insertDirectory`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.playlist.insertDirectory";

/// Insert a directory into a playlist
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parameters {
    /// The directory (id) to insert into the playlist
    pub directory: String,
    /// The position in the playlist to insert the directory at, if not
    /// specified, the directory will be appended
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<i64>,
    /// The URI of the playlist to start Format: `at-uri`.
    pub uri: String,
}
