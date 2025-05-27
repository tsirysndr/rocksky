use serde::{Deserialize, Serialize};

use super::currently_playing::{Artist, ExternalUrls};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct AlbumTracks {
    pub href: String,
    pub items: Vec<Track>,
    pub limit: u32,
    pub next: Option<String>,
    pub offset: u32,
    pub previous: Option<String>,
    pub total: u32,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Track {
    pub artists: Vec<Artist>,
    pub available_markets: Vec<String>,
    pub disc_number: u32,
    pub duration_ms: u32,
    pub explicit: bool,
    pub external_urls: Option<ExternalUrls>,
    pub href: String,
    pub id: String,
    pub name: String,
    pub preview_url: Option<String>,
    pub track_number: u32,
    pub r#type: String, // `type` is a reserved keyword, so we use `r#type`
    pub uri: String,
    pub is_local: bool,
}
