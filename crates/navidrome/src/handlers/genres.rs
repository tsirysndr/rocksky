use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::{collections::HashMap, sync::Arc};

use crate::{handlers::songs::track_to_json, repo, response};

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
            let songs: Vec<Value> = tracks.iter().map(|t| track_to_json(t, user_id)).collect();
            response::ok(format, json!({ "songsByGenre": { "song": songs } }))
        }
        Err(e) => {
            tracing::error!("getSongsByGenre error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}
