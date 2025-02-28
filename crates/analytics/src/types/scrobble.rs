use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Scrobble {
    pub id: String,
    pub user_id: String,
    pub track_id: String,
    pub album_id: String,
    pub artist_id: String,
    pub uri: Option<String>,
    pub created_at: NaiveDateTime,
}
