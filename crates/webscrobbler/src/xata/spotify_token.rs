use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, Deserialize, sqlx::FromRow, Default, Clone)]
pub struct SpotifyToken {
    pub xata_id: String,
    pub xata_version: i32,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_updatedat: DateTime<Utc>,
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub spotify_app_id: String,
    pub spotify_secret: String,
}

#[derive(Debug, Deserialize, sqlx::FromRow, Default, Clone)]
pub struct SpotifyTokenWithEmail {
    pub xata_id: String,
    pub xata_version: i32,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_updatedat: DateTime<Utc>,
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub email: String,
    pub did: String,
    pub spotify_app_id: String,
    pub spotify_secret: String,
}
