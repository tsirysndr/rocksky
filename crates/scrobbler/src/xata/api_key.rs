use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct ApiKey {
    pub xata_id: String,
    pub name: String,
    pub api_key: String,
    pub shared_secret: String,
    pub description: Option<String>,
    pub user_id: String,
    pub enabled: bool,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_updatedat: DateTime<Utc>,
}
