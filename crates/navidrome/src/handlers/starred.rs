use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use crate::{handlers::albums::mime_to_suffix, repo, response};

pub async fn handle_get_starred2(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    match repo::starred::get_starred_tracks(pool, user_id).await {
        Ok(tracks) => {
            let songs: Vec<Value> = tracks
                .iter()
                .map(|t| {
                    let suffix = mime_to_suffix(&t.mime_type);
                    let path = format!("{}/{}/{}.{}", t.artist, t.album, t.title, suffix);
                    let mut s = json!({
                        "id": t.xata_id,
                        "isDir": false,
                        "isVideo": false,
                        "title": t.title,
                        "album": t.album,
                        "artist": t.artist,
                        "duration": t.duration / 1000,
                        "size": t.file_size,
                        "contentType": t.mime_type,
                        "suffix": suffix,
                        "type": "music",
                        "starred": t.starred_at.to_rfc3339(),
                        "created": t.xata_createdat.to_rfc3339(),
                        "path": path,
                    });
                    if let Some(tn) = t.track_number {
                        s["track"] = json!(tn);
                    }
                    if let Some(g) = &t.genre {
                        s["genre"] = json!(g);
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
                })
                .collect();

            response::ok(
                format,
                json!({
                    "starred2": {
                        "artist": [],
                        "album": [],
                        "song": songs,
                    }
                }),
            )
        }
        Err(e) => {
            tracing::error!("getStarred2 error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}
