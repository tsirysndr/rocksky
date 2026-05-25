use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::{collections::HashMap, sync::Arc};

use crate::{handlers::albums::mime_to_suffix, repo, response};

pub async fn handle_get_artist_info(
    format: &str,
    user_id: &str,
    artist_id: &str,
    pool: &Arc<Pool<Postgres>>,
    is_v2: bool,
) -> HttpResponse {
    let artist = match repo::artist::get_artist_by_id(pool, artist_id, user_id).await {
        Ok(Some(a)) => a,
        Ok(None) => return response::err(format, 70, "Artist not found"),
        Err(e) => {
            tracing::error!("getArtistInfo error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    };

    let mut info = json!({
        "similarArtist": [],
    });

    if let Some(pic) = &artist.picture {
        info["smallImageUrl"] = json!(pic);
        info["mediumImageUrl"] = json!(pic);
        info["largeImageUrl"] = json!(pic);
    }

    let key = if is_v2 { "artistInfo2" } else { "artistInfo" };
    response::ok(format, json!({ key: info }))
}

pub async fn handle_get_album_info(
    format: &str,
    album_id: &str,
    pool: &Arc<Pool<Postgres>>,
    is_v2: bool,
    _params: &HashMap<String, String>,
) -> HttpResponse {
    let _ = pool;
    let _ = album_id;
    let key = if is_v2 { "albumInfo2" } else { "albumInfo" };
    response::ok(format, json!({ key: {} }))
}

pub async fn handle_get_now_playing(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    match repo::nowplaying::get_now_playing(pool, user_id).await {
        Ok(entries) => {
            let list: Vec<Value> = entries
                .iter()
                .map(|e| {
                    let suffix = mime_to_suffix(&e.mime_type);
                    let mut s = json!({
                        "id": e.xata_id,
                        "isDir": false,
                        "title": e.title,
                        "album": e.album,
                        "artist": e.artist,
                        "duration": e.duration,
                        "size": e.file_size,
                        "contentType": e.mime_type,
                        "suffix": suffix,
                        "type": "music",
                        "username": e.handle,
                        "minutesAgo": e.minutes_ago,
                        "playerId": 1,
                    });
                    if e.album_art.is_some() {
                        s["coverArt"] = json!(format!("al-{}", e.xata_id));
                    }
                    s
                })
                .collect();

            response::ok(format, json!({ "nowPlaying": { "entry": list } }))
        }
        Err(e) => {
            tracing::error!("getNowPlaying error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}
