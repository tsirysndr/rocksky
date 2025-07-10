use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, Deserialize, sqlx::FromRow, Default, Clone)]
pub struct GoogleDriveDirectory {
    pub xata_id: String,
    pub name: String,
    pub path: String,
    pub file_id: String,
    pub parent_id: Option<String>,
    pub google_drive_id: String,
    pub xata_version: i32,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_updatedat: DateTime<Utc>,
}
