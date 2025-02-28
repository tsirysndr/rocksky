use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct Track {
    pub xata_id: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album_art: Option<String>,
    pub album: String,
    pub track_number: i32,
    pub duration: i32,
    pub mb_id: Option<String>,
    pub youtube_link: Option<String>,
    pub spotify_link: Option<String>,
    pub tidal_link: Option<String>,
    pub apple_music_link: Option<String>,
    pub sha256: String,
    pub lyrics: Option<String>,
    pub composer: Option<String>,
    pub genre: Option<String>,
    pub disc_number: i32,
    pub copyright_message: Option<String>,
    pub label: Option<String>,
    pub uri: Option<String>,
    pub artist_uri: Option<String>,
    pub album_uri: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
}
