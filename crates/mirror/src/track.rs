//! Normalized track payload posted to `app.rocksky.scrobble.createScrobble`.
//!
//! Matches the Zod schema at `apps/api/src/types/track.ts`. Only the four
//! required fields are mandatory; everything else is best-effort enrichment
//! from the source's response.

use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct NormalizedTrack {
    pub title: String,
    pub artist: String,
    pub album: String,
    #[serde(rename = "albumArtist")]
    pub album_artist: String,

    /// Track duration in **milliseconds** (matches the Track schema).
    pub duration: i64,

    /// Unix seconds for when the play occurred (Track schema allows this).
    pub timestamp: i64,

    #[serde(skip_serializing_if = "Option::is_none", rename = "mbId")]
    pub mb_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "albumArt")]
    pub album_art: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "spotifyLink")]
    pub spotify_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "lastfmLink")]
    pub lastfm_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "trackNumber")]
    pub track_number: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "discNumber")]
    pub disc_number: Option<i32>,
}

impl NormalizedTrack {
    pub fn at(&self) -> DateTime<Utc> {
        DateTime::from_timestamp(self.timestamp, 0).unwrap_or_else(Utc::now)
    }
}
