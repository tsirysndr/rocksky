use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};

use super::pagination::Pagination;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Scrobble {
    pub id: String,
    pub user_id: String,
    pub track_id: String,
    pub album_id: String,
    pub artist_id: String,
    pub uri: Option<String>,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct ScrobbleTrack {
    pub id: String,
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album_art: Option<String>,
    pub album: String,
    pub handle: String,
    pub did: String,
    pub uri: Option<String>,
    pub track_uri: Option<String>,
    pub artist_uri: Option<String>,
    pub album_uri: Option<String>,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct ScrobblesPerDay {
    pub date: NaiveDate,
    pub count: i32,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct ScrobblesPerMonth {
    pub year_month: String,
    pub count: i32,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct ScrobblesPerYear {
    pub year: i32,
    pub count: i32,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetScrobblesParams {
    pub user_did: Option<String>,
    pub pagination: Option<Pagination>,
}
