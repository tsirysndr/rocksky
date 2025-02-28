use actix_web::{body::BoxBody, http::header::ContentType, HttpRequest, HttpResponse, Responder};
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album_art: Option<String>,
    pub album: String,
    pub track_number: i32,
    pub duration: i32,
    pub mb_id: Option<String>,
    pub youtube_link: Option<String>,
    pub spotify_link: Option<String>,
    pub tidal_link: Option<String>,
    pub apple_music_link: Option<String>,
    pub sha256: String,
    pub lyrics: Option<String>,
    pub composer: Option<String>,
    pub genre: Option<String>,
    pub disc_number: i32,
    pub copyright_message: Option<String>,
    pub label: Option<String>,
    pub uri: Option<String>,
    pub artist_uri: Option<String>,
    pub album_uri: Option<String>,
    pub created_at: NaiveDateTime,
}

impl Responder for Track {
    type Body = BoxBody;

    fn respond_to(self, _req: &HttpRequest) -> HttpResponse<Self::Body> {
        let body = serde_json::to_string(&self).unwrap();

        // Create response and set content type
        HttpResponse::Ok()
            .content_type(ContentType::json())
            .body(body)
    }
}
