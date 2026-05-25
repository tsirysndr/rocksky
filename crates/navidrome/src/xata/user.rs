use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, sqlx::FromRow, Serialize, Deserialize, Clone)]
pub struct User {
    pub xata_id: String,
    pub display_name: String,
    pub did: String,
    pub handle: String,
    pub avatar: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow, Clone)]
pub struct UserWithApiKey {
    pub xata_id: String,
    pub handle: String,
    pub display_name: String,
    pub avatar: Option<String>,
    pub api_key: String,
}
