use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, Deserialize, sqlx::FromRow, Default, Clone)]
pub struct GoogleDriveToken {
    pub xata_id: String,
    pub refresh_token: String,
    pub xata_version: i32,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_updatedat: DateTime<Utc>,
}

#[derive(Debug, Deserialize, sqlx::FromRow, Default, Clone)]
pub struct GoogleDriveTokenWithDid {
    pub xata_id: String,
    pub refresh_token: String,
    pub xata_version: i32,
    pub did: String,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_updatedat: DateTime<Utc>,
}
