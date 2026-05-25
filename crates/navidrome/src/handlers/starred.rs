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
                        "starred": t.starred_at.to_rfc3339(),
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
