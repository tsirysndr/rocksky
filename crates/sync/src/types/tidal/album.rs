use crate::types::tidal::{
    include::{Include, Relationships},
    link::Links,
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct AlbumsResponse {
    pub data: Vec<Album>,
    pub links: Links,
    pub included: Option<Vec<Include>>,
}

#[derive(Debug, Deserialize)]
pub struct AlbumResponse {
    pub data: Album,
    pub links: Links,
    pub included: Option<Vec<Include>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumAttributes {
    pub barcode_id: String,
    pub number_of_volumes: u32,
    pub number_of_items: u32,
    pub release_date: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub attributes: AlbumAttributes,
    pub r#type: String,
    pub relationships: Option<Relationships>,
}
