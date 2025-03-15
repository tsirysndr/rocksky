use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, Deserialize, sqlx::FromRow, Default, Clone)]
pub struct DropboxToken {
    pub xata_id: String,
    pub xata_version: i32,
    pub refresh_token: String,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_updatedat: DateTime<Utc>,
}

#[derive(Debug, Deserialize, sqlx::FromRow, Default, Clone)]
pub struct DropboxTokenWithDid {
    pub xata_id: String,
    pub xata_version: i32,
    pub refresh_token: String,
    pub did: String,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_updatedat: DateTime<Utc>,
}
