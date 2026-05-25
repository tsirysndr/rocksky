use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use crate::{handlers::albums::mime_to_suffix, repo, response};

pub async fn handle_get_song(
    format: &str,
    user_id: &str,
    song_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    match repo::track::get_track_by_id(pool, song_id, user_id).await {
        Ok(Some(t)) => {
            let song = track_to_json(&t, user_id);
            response::ok(format, json!({ "song": song }))
        }
        Ok(None) => response::err(format, 70, "Song not found"),
        Err(e) => {
            tracing::error!("getSong error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}

pub async fn handle_get_random_songs(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &std::collections::HashMap<String, String>,
) -> HttpResponse {
    let count: i64 = params
        .get("size")
        .and_then(|s| s.parse().ok())
        .unwrap_or(10)
        .min(500);
    let genre = params.get("genre").map(|s| s.as_str());
    let from_year: Option<i32> = params.get("fromYear").and_then(|s| s.parse().ok());
    let to_year: Option<i32> = params.get("toYear").and_then(|s| s.parse().ok());

    match repo::track::get_random_songs(pool, user_id, count, genre, from_year, to_year).await {
        Ok(tracks) => {
            let songs: Vec<Value> = tracks.iter().map(|t| track_to_json(t, user_id)).collect();
            response::ok(format, json!({ "randomSongs": { "song": songs } }))
        }
        Err(e) => {
            tracing::error!("getRandomSongs error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}

pub fn track_to_json(t: &crate::xata::track::TrackWithUpload, _user_id: &str) -> Value {
    let suffix = mime_to_suffix(&t.mime_type);
    let path = format!("{}/{}/{}.{}", t.artist, t.album, t.title, suffix);
    let mut s = json!({
        "id": t.xata_id,
        "isDir": false,
        "isVideo": false,
        "title": t.title,
        "album": t.album,
        "artist": t.artist,
        "duration": t.duration,
        "size": t.file_size,
        "contentType": t.mime_type,
        "suffix": suffix,
        "type": "music",
        "created": t.xata_createdat.to_rfc3339(),
        "path": path,
    });

    if let Some(tn) = t.track_number {
        s["track"] = json!(tn);
    }
    if let Some(dn) = t.disc_number {
        s["discNumber"] = json!(dn);
    }
    if let Some(g) = &t.genre {
        s["genre"] = json!(g);
    }
    if let Some(mb) = &t.mb_id {
        s["musicBrainzId"] = json!(mb);
    }

    if let Some(album_id) = &t.album_id {
        s["albumId"] = json!(album_id);
        s["coverArt"] = json!(format!("al-{}", album_id));
    } else if t.album_art.is_some() {
        s["coverArt"] = json!(format!("tr-{}", t.xata_id));
    }

    if let Some(artist_id) = &t.artist_id {
        s["artistId"] = json!(artist_id);
    }

    s
}
