use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub picture: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    pub uri: Option<String>,
    pub created_by: String,
    pub listeners: Option<i32>,
}
