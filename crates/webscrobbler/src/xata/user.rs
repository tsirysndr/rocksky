use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct User {
    pub xata_id: String,
    pub display_name: String,
    pub did: String,
    pub handle: String,
    pub avatar: String,
    pub shared_secret: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
}
