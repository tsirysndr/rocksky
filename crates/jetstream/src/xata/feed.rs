use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct Feed {
    pub xata_id: String,
    pub display_name: String,
    pub description: Option<String>,
    pub avatar: Option<String>,
    pub uri: String,
    pub did: String,
    pub user_id: String,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
}
