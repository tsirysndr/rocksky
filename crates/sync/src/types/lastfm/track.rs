use crate::types::lastfm::{album::Album, artist::Artist};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct Track {
    pub artist: Artist,
    pub name: String,
    pub album: Album,
    pub url: String,
    pub date: Option<Date>,
    #[serde(rename = "@attr")]
    pub attr: Option<TrackAttr>,
}
#[derive(Debug, Deserialize, Serialize)]
pub struct Date {
    pub uts: String,
    #[serde(rename = "#text")]
    pub text: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TrackAttr {
    pub nowplaying: String,
}
