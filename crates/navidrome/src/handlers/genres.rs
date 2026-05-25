use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::{collections::HashMap, sync::Arc};

use crate::{handlers::albums::mime_to_suffix, repo, response};

pub async fn handle_get_genres(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    match repo::genre::get_genres(pool, user_id).await {
        Ok(genres) => {
            let list: Vec<Value> = genres
                .iter()
                .map(|g| {
                    json!({
                        "songCount": g.song_count,
                        "albumCount": g.album_count,
                        "value": g.genre,
                    })
                })
                .collect();
            response::ok(format, json!({ "genres": { "genre": list } }))
        }
        Err(e) => {
            tracing::error!("getGenres error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}

pub async fn handle_get_songs_by_genre(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &HashMap<String, String>,
) -> HttpResponse {
    let genre = match params.get("genre") {
        Some(g) if !g.is_empty() => g.as_str(),
        _ => return response::err(format, 10, "Missing genre parameter"),
    };

    let count: i64 = params
        .get("count")
        .and_then(|s| s.parse().ok())
        .unwrap_or(10)
        .min(500);
    let offset: i64 = params
        .get("offset")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    match repo::genre::get_songs_by_genre(pool, user_id, genre, count, offset).await {
        Ok(tracks) => {
            let songs: Vec<Value> = tracks
                .iter()
                .map(|t| {
                    let suffix = mime_to_suffix(&t.mime_type);
                    let mut s = json!({
                        "id": t.xata_id,
                        "isDir": false,
                        "title": t.title,
                        "album": t.album,
                        "artist": t.artist,
                        "duration": t.duration,
                        "size": t.file_size,
                        "contentType": t.mime_type,
                        "suffix": suffix,
                        "type": "music",
                    });
                    if let Some(tn) = t.track_number {
                        s["track"] = json!(tn);
                    }
                    if let Some(g) = &t.genre {
                        s["genre"] = json!(g);
                    }
                    if t.album_art.is_some() {
                        s["coverArt"] = json!(format!("tr-{}", t.xata_id));
                    }
                    s
                })
                .collect();

            response::ok(format, json!({ "songsByGenre": { "song": songs } }))
        }
        Err(e) => {
            tracing::error!("getSongsByGenre error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}
