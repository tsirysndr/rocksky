use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use crate::{handlers::songs::track_to_json, repo, response};

fn playlist_to_json(p: &repo::playlist::PlaylistRow) -> Value {
    let mut obj = json!({
        "id": p.xata_id,
        "name": p.name,
        "public": false,
        "songCount": p.track_count,
        "duration": 0,
        "created": p.xata_createdat.to_rfc3339(),
        "changed": p.xata_createdat.to_rfc3339(),
    });
    if let Some(desc) = &p.description {
        obj["comment"] = json!(desc);
    }
    if p.picture.is_some() {
        obj["coverArt"] = json!(format!("pl-{}", p.xata_id));
    }
    obj
}

pub async fn handle_get_playlists(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    match repo::playlist::get_playlists(pool, user_id).await {
        Ok(playlists) => {
            let list: Vec<Value> = playlists.iter().map(playlist_to_json).collect();
            response::ok(format, json!({ "playlists": { "playlist": list } }))
        }
        Err(e) => {
            tracing::error!("getPlaylists error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}

pub async fn handle_get_playlist(
    format: &str,
    user_id: &str,
    playlist_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    match repo::playlist::get_playlist(pool, playlist_id, user_id).await {
        Ok(Some((p, tracks))) => {
            let songs: Vec<Value> = tracks.iter().map(|t| track_to_json(t, user_id)).collect();
            let mut obj = playlist_to_json(&p);
            obj["entry"] = json!(songs);
            response::ok(format, json!({ "playlist": obj }))
        }
        Ok(None) => response::err(format, 70, "Playlist not found"),
        Err(e) => {
            tracing::error!("getPlaylist error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}
