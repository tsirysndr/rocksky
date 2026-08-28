use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, sqlx::FromRow, Serialize, Deserialize, Clone)]
pub struct AlbumRow {
    pub xata_id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<i32>,
    pub album_art: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow, Clone)]
pub struct AlbumWithStats {
    pub xata_id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<i32>,
    pub album_art: Option<String>,
    pub song_count: i64,
    pub total_duration: Option<i64>,
    pub created_at: Option<DateTime<Utc>>,
    pub artist_id: Option<String>,
    /// AT-URI of the `app.rocksky.album` record this album belongs to, NULL
    /// until the record has been published. Mirrors `PlaylistRow::uri`, and is
    /// what lets a client address a library album by record rather than by the
    /// Navidrome id, which is local to this server.
    pub uri: Option<String>,
}
