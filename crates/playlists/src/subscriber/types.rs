use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserPayload {
    pub xata_id: String,
    pub avatar: String,
    pub did: String,
    pub display_name: String,
    pub handle: String,
    pub xata_createdat: DateTime<Utc>,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
}
