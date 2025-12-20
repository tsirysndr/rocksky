use serde::Deserialize;

use crate::types::spotify::{artist::Artist, external_urls::ExternalUrls, image::Image};

#[derive(Debug, Deserialize, Clone)]
pub struct Album {
    pub album_type: String,
    pub id: String,
    pub href: String,
    pub images: Vec<Image>,
    pub name: String,
    pub r#type: String,
    pub is_playable: Option<bool>,
    pub uri: String,
    pub total_tracks: u32,
    pub release_date: String,
    pub release_date_precision: String,
    pub external_urls: ExternalUrls,
    pub available_markets: Vec<String>,
    pub artists: Vec<Artist>,
    pub label: Option<String>,
}
