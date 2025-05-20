use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct Webscrobbler {
    pub xata_id: String,
    pub name: String,
    pub description: Option<String>,
    pub user_id: String,
    pub uuid: String,
    pub enabled: bool,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
}
