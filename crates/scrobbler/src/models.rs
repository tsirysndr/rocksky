use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Scrobble {
    pub artist: String,
    pub track: String,
    pub timestamp: i64,
    pub album: Option<String>,
    pub context: Option<String>,
    pub stream_id: Option<String>,
    pub chosen_by_user: Option<u8>,
    pub track_number: Option<u32>,
    pub mbid: Option<String>,
    pub album_artist: Option<String>,
    pub duration: Option<u32>,
}
