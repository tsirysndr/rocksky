use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, sqlx::FromRow, Serialize, Deserialize, Clone)]
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

#[derive(Debug, sqlx::FromRow, Serialize, Deserialize, Clone)]
pub struct UserWithoutSecret {
    pub xata_id: String,
    pub display_name: String,
    pub did: String,
    pub handle: String,
    pub avatar: String,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
}
