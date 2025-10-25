use serde::{Deserialize, Serialize};

use crate::types::lastfm::track::Track;

#[derive(Debug, Deserialize, Serialize)]
pub struct RecentTracksResponse {
    pub recenttracks: RecentTrack,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct RecentTrack {
    #[serde(rename = "@attr")]
    pub attr: RecentTrackAttr,
    #[serde(rename = "track")]
    pub tracks: Vec<Track>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct RecentTrackAttr {
    pub user: String,
    pub page: String,
    #[serde(rename = "perPage")]
    pub per_page: String,
    #[serde(rename = "totalPages")]
    pub total_pages: String,
    pub total: String,
}
