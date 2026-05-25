use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use crate::{handlers::albums::mime_to_suffix, repo, response};

pub async fn handle_get_music_directory(
    format: &str,
    user_id: &str,
    id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    // root → all artists
    if id == "1" || id == "root" {
        return match repo::artist::get_all_artists(pool, user_id).await {
            Ok(artists) => {
                let children: Vec<Value> = artists
                    .iter()
                    .map(|a| {
                        let mut obj = json!({
                            "id": a.xata_id,
                            "parent": "1",
                            "isDir": true,
                            "title": a.name,
                            "name": a.name,
                        });
                        if let Some(pic) = &a.picture {
                            obj["coverArt"] = json!(format!("ar-{}", a.xata_id));
                            let _ = pic;
                        }
                        obj
                    })
                    .collect();
                response::ok(
                    format,
                    json!({
                        "directory": {
                            "id": "1",
                            "name": "Music",
                            "child": children
                        }
                    }),
                )
            }
            Err(e) => {
                tracing::error!("getMusicDirectory artists error: {}", e);
                response::err(format, 0, "Internal server error")
            }
        };
    }

    // try as artist → list albums
    if let Ok(Some(artist)) = repo::artist::get_artist_by_id(pool, id, user_id).await {
        return match repo::album::get_albums_by_artist(pool, id, user_id).await {
            Ok(albums) => {
                let children: Vec<Value> = albums
                    .iter()
                    .map(|a| {
                        let mut obj = json!({
                            "id": a.xata_id,
                            "parent": id,
                            "isDir": true,
                            "title": a.title,
                            "name": a.title,
                            "artist": a.artist,
                            "artistId": id,
                        });
                        if let Some(year) = a.year {
                            obj["year"] = json!(year);
                        }
                        if a.album_art.is_some() {
                            obj["coverArt"] = json!(format!("al-{}", a.xata_id));
                        }
                        obj
                    })
                    .collect();
                response::ok(
                    format,
                    json!({
                        "directory": {
                            "id": id,
                            "name": artist.name,
                            "child": children
                        }
                    }),
                )
            }
            Err(e) => {
                tracing::error!("getMusicDirectory albums error: {}", e);
                response::err(format, 0, "Internal server error")
            }
        };
    }

    // try as album → list tracks
    if let Ok(Some(album)) = repo::album::get_album_by_id(pool, id, user_id).await {
        return match repo::track::get_tracks_by_album(pool, id, user_id).await {
            Ok(tracks) => {
                let children: Vec<Value> = tracks
                    .iter()
                    .map(|t| {
                        let suffix = mime_to_suffix(&t.mime_type);
                        let mut s = json!({
                            "id": t.xata_id,
                            "parent": id,
                            "isDir": false,
                            "isVideo": false,
                            "title": t.title,
                            "album": t.album,
                            "artist": t.artist,
                            "albumId": id,
                            "coverArt": format!("al-{}", id),
                            "duration": t.duration,
                            "size": t.file_size,
                            "contentType": t.mime_type,
                            "suffix": suffix,
                            "type": "music",
                            "created": t.xata_createdat.to_rfc3339(),
                        });
                        if let Some(tn) = t.track_number {
                            s["track"] = json!(tn);
                        }
                        if let Some(aid) = &album.artist_id {
                            s["artistId"] = json!(aid);
                        }
                        s
                    })
                    .collect();
                response::ok(
                    format,
                    json!({
                        "directory": {
                            "id": id,
                            "name": album.title,
                            "child": children
                        }
                    }),
                )
            }
            Err(e) => {
                tracing::error!("getMusicDirectory tracks error: {}", e);
                response::err(format, 0, "Internal server error")
            }
        };
    }

    response::err(format, 70, "Directory not found")
}
