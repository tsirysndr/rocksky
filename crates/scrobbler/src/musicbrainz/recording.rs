use serde::Deserialize;

use super::{artist::ArtistCredit, release::Release};

#[derive(Debug, Deserialize)]
pub struct Recordings {
    pub recordings: Vec<Recording>,
    pub count: u32,
    pub offset: u32,
    pub created: String,
}

#[derive(Debug, Deserialize)]
pub struct Recording {
    #[serde(rename = "first-release-date")]
    pub first_release_date: Option<String>,
    pub title: String,
    pub disambiguation: Option<String>,
    pub video: Option<bool>,
    #[serde(rename = "artist-credit")]
    pub artist_credit: Option<Vec<ArtistCredit>>,
    pub id: String,
    pub length: Option<u32>,
    pub releases: Option<Vec<Release>>,
}
