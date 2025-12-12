use serde::{Deserialize, Serialize};

use crate::types::lastfm::track::Track;

#[derive(Debug, Deserialize, Serialize)]
pub struct LovedTracksResponse {
    pub lovedtracks: LovedTrack,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LovedTrack {
    #[serde(rename = "@attr")]
    pub attr: LovedTrackAttr,
    #[serde(rename = "track")]
    pub tracks: Vec<Track>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LovedTrackAttr {
    pub user: String,
    pub page: String,
    #[serde(rename = "perPage")]
    pub per_page: String,
    #[serde(rename = "totalPages")]
    pub total_pages: String,
    pub total: String,
}
