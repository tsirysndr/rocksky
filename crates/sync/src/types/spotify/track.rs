use crate::types::spotify::{
    album::Album, artist::Artist, external_ids::ExternalIds, external_urls::ExternalUrls,
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct SavedTracks {
    pub href: String,
    pub items: Vec<Item>,
    pub limit: u32,
    pub next: Option<String>,
    pub offset: u32,
    pub previous: Option<String>,
    pub total: u32,
}

#[derive(Debug, Deserialize)]
pub struct Item {
    pub added_at: String,
    pub track: Track,
}

#[derive(Debug, Deserialize)]
pub struct Track {
    pub album: Album,
    pub artists: Vec<Artist>,
    pub available_markets: Vec<String>,
    pub disc_number: u32,
    pub duration_ms: u32,
    pub explicit: bool,
    pub external_urls: ExternalUrls,
    pub external_ids: ExternalIds,
    pub href: String,
    pub id: String,
    pub is_local: bool,
    pub name: String,
    pub popularity: u32,
    pub preview_url: Option<String>,
    pub track_number: u32,
    pub r#type: String,
    pub uri: String,
}
