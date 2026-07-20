use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::collections::HashMap;
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

async fn present_playlist(
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
        Ok(None) => response::ok(format, json!({})),
        Err(e) => {
            tracing::error!("present playlist error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}

pub async fn handle_create_playlist(
    format: &str,
    user_id: &str,
    name: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    match repo::playlist::create_playlist(pool, user_id, name, None).await {
        Ok(playlist_id) => present_playlist(format, user_id, &playlist_id, pool).await,
        Err(e) => {
            tracing::error!("createPlaylist error: {}", e);
            response::err(format, 0, "Failed to create playlist")
        }
    }
}

pub async fn handle_delete_playlist(
    format: &str,
    user_id: &str,
    playlist_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    match repo::playlist::is_owner(pool, playlist_id, user_id).await {
        Ok(true) => match repo::playlist::delete_playlist(pool, playlist_id).await {
            Ok(_) => response::ok(format, json!({})),
            Err(e) => {
                tracing::error!("deletePlaylist error: {}", e);
                response::err(format, 0, "Failed to delete playlist")
            }
        },
        Ok(false) => response::err(format, 50, "Not authorized to delete this playlist"),
        Err(e) => {
            tracing::error!("deletePlaylist owner check error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}

pub async fn handle_update_playlist(
    format: &str,
    user_id: &str,
    params: &HashMap<String, String>,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    let playlist_id = match params.get("playlistId").or_else(|| params.get("id")) {
        Some(id) => id.as_str(),
        None => return response::err(format, 10, "Missing playlistId parameter"),
    };

    match repo::playlist::is_owner(pool, playlist_id, user_id).await {
        Ok(true) => {}
        Ok(false) => return response::err(format, 50, "Not authorized to edit this playlist"),
        Err(e) => {
            tracing::error!("updatePlaylist owner check error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    }

    let name = params
        .get("name")
        .map(|s| s.as_str())
        .filter(|s| !s.is_empty());
    let comment = params.get("comment").map(|s| s.as_str());
    if name.is_some() || comment.is_some() {
        if let Err(e) = repo::playlist::update_meta(pool, playlist_id, name, comment).await {
            tracing::error!("updatePlaylist meta error: {}", e);
            return response::err(format, 0, "Failed to update playlist");
        }
    }

    if let Some(song_id) = params.get("songIdToAdd").filter(|s| !s.is_empty()) {
        if let Err(e) = repo::playlist::add_track(pool, playlist_id, song_id).await {
            tracing::error!("updatePlaylist add error: {}", e);
            return response::err(format, 0, "Failed to add track to playlist");
        }
    }

    if let Some(index) = params
        .get("songIndexToRemove")
        .and_then(|s| s.parse::<i64>().ok())
    {
        if let Err(e) = repo::playlist::remove_track_at(pool, playlist_id, index).await {
            tracing::error!("updatePlaylist remove error: {}", e);
            return response::err(format, 0, "Failed to remove track from playlist");
        }
    }

    response::ok(format, json!({}))
}
