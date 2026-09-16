//! `app.rocksky.charts.getScrobblesChart`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.charts.getScrobblesChart";

/// Get the scrobbles chart
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parameters {
    /// The URI of the album to filter by Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub albumuri: Option<String>,
    /// The URI of the artist to filter by Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artisturi: Option<String>,
    /// The DID or handle of the actor Format: `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    /// Start date (ISO 8601). Defaults to 6 months ago.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    /// The genre to filter by
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// The URI of the track to filter by Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub songuri: Option<String>,
    /// End date (ISO 8601). Defaults to today.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
}

/// The response body.
pub type Output = super::super::super::super::app::rocksky::charts::defs::ChartsView;

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
        parameters: Parameters,
    ) -> impl std::future::Future<Output = Result<Output, Self::Error>> + Send;
}
