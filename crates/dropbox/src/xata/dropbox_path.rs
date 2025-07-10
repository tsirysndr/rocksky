use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, Deserialize, sqlx::FromRow, Default, Clone)]
pub struct DropboxPath {
    pub xata_id: String,
    pub dropbox_id: String,
    pub path: String,
    pub name: String,
    pub file_id: String,
    pub directory_id: Option<String>,
    pub track_id: String,
    pub xata_version: i32,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_updatedat: DateTime<Utc>,
}
