use serde::Deserialize;

use super::{
    artist::{Area, ArtistCredit},
    label::LabelInfo,
    recording::Recording,
};

#[derive(Debug, Deserialize, Clone)]
pub struct Release {
    #[serde(rename = "release-events")]
    pub release_events: Option<Vec<ReleaseEvent>>,
    pub quality: Option<String>,
    #[serde(rename = "text-representation")]
    pub text_representation: Option<TextRepresentation>,
    pub status: Option<String>,
    pub packaging: Option<String>,
    pub barcode: Option<String>,
    pub id: String,
    #[serde(rename = "packaging-id")]
    pub packaging_id: Option<String>,
    pub media: Option<Vec<Media>>,
    pub disambiguation: Option<String>,
    #[serde(rename = "cover-art-archive")]
    pub cover_art_archive: Option<CoverArtArchive>,
    #[serde(rename = "artist-credit")]
    pub artist_credit: Vec<ArtistCredit>,
    #[serde(rename = "status-id")]
    pub status_id: Option<String>,
    #[serde(rename = "label-info")]
    pub label_info: Option<Vec<LabelInfo>>,
    pub title: String,
    pub date: Option<String>,
    pub country: Option<String>,
    pub asin: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct CoverArtArchive {
    pub back: bool,
    pub artwork: bool,
    pub front: bool,
    pub count: u32,
    pub darkened: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ReleaseEvent {
    pub area: Option<Area>,
    pub date: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TextRepresentation {
    pub language: Option<String>,
    pub script: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Media {
    #[serde(rename = "format-id")]
    pub format_id: Option<String>,
    pub discs: Option<Vec<Disc>>,
    pub position: u32,
    pub tracks: Option<Vec<Track>>,
    #[serde(rename = "track-offset")]
    pub track_offset: u32,
    pub title: Option<String>,
    #[serde(rename = "track-count")]
    pub track_count: u32,
    pub format: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Disc {
    pub offset: Option<u32>,
    pub sectors: u32,
    pub id: String,
    pub offsets: Option<Vec<u32>>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Track {
    pub length: i64,
    pub id: String,
    pub position: u32,
    pub title: String,
    pub recording: Recording,
    #[serde(rename = "artist-credit")]
    pub artist_credit: Vec<ArtistCredit>,
    pub number: String,
}
