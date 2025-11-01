use crate::types::tidal::{
    include::{Include, Relationships},
    link::Links,
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ArtistsResponse {
    pub data: Vec<Artist>,
    pub links: Links,
    pub included: Option<Vec<Include>>,
}

#[derive(Debug, Deserialize)]
pub struct ArtistResponse {
    pub data: Artist,
    pub links: Links,
    pub included: Option<Vec<Include>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistAttributes {
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artist {
    pub id: String,
    pub attributes: ArtistAttributes,
    pub r#type: String,
    pub relationships: Option<Relationships>,
}
