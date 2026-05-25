use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use crate::{repo, response, xata::album::AlbumWithStats};

fn album_to_json(a: &AlbumWithStats, artist_id_override: Option<&str>) -> Value {
    let mut obj = json!({
        "id": a.xata_id,
        "name": a.title,
        "title": a.title,
        "artist": a.artist,
        "songCount": a.song_count,
        "duration": a.total_duration.unwrap_or(0),
        "created": a.created_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
    });

    let aid = artist_id_override.or(a.artist_id.as_deref());
    if let Some(aid) = aid {
        obj["artistId"] = json!(aid);
    }

    if let Some(year) = a.year {
        obj["year"] = json!(year);
    }

    if let Some(art) = &a.album_art {
        obj["coverArt"] = json!(format!("al-{}", a.xata_id));
        let _ = art;
    }

    obj
}

pub async fn handle_get_album(
    format: &str,
    user_id: &str,
    album_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    let album = match repo::album::get_album_by_id(pool, album_id, user_id).await {
        Ok(Some(a)) => a,
        Ok(None) => return response::err(format, 70, "Album not found"),
        Err(e) => {
            tracing::error!("getAlbum error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    };

    let tracks = match repo::track::get_tracks_by_album(pool, album_id, user_id).await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("getAlbum tracks error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    };

    let songs: Vec<Value> = tracks
        .iter()
        .map(|t| {
            let suffix = mime_to_suffix(&t.mime_type);
            let path = format!("{}/{}/{}.{}", t.artist, t.album, t.title, suffix);
            let mut s = json!({
                "id": t.xata_id,
                "parent": album_id,
                "isDir": false,
                "isVideo": false,
                "title": t.title,
                "album": t.album,
                "artist": t.artist,
                "duration": t.duration,
                "size": t.file_size,
                "contentType": t.mime_type,
                "suffix": suffix,
                "albumId": album_id,
                "coverArt": format!("al-{}", album_id),
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
            if let Some(aid) = &album.artist_id {
                s["artistId"] = json!(aid);
            }
            s
        })
        .collect();

    let mut album_obj = album_to_json(&album, None);
    album_obj["song"] = json!(songs);

    response::ok(format, json!({ "album": album_obj }))
}

pub async fn handle_get_album_list2(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &std::collections::HashMap<String, String>,
) -> HttpResponse {
    let list_type = params.get("type").map(|s| s.as_str()).unwrap_or("newest");
    let count: i64 = params
        .get("size")
        .and_then(|s| s.parse().ok())
        .unwrap_or(10)
        .min(500);
    let offset: i64 = params
        .get("offset")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let from_year: Option<i32> = params.get("fromYear").and_then(|s| s.parse().ok());
    let to_year: Option<i32> = params.get("toYear").and_then(|s| s.parse().ok());
    let genre = params.get("genre").map(|s| s.as_str());

    // "starred" albums not supported — return empty
    if list_type == "starred" {
        return response::ok(format, json!({ "albumList2": { "album": [] } }));
    }

    match repo::album::get_album_list(
        pool, user_id, list_type, count, offset, from_year, to_year, genre,
    )
    .await
    {
        Ok(albums) => {
            let list: Vec<Value> = albums.iter().map(|a| album_to_json(a, None)).collect();
            response::ok(format, json!({ "albumList2": { "album": list } }))
        }
        Err(e) => {
            tracing::error!("getAlbumList2 error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}

pub fn mime_to_suffix(mime: &str) -> &str {
    match mime {
        "audio/mpeg" | "audio/mp3" => "mp3",
        "audio/flac" => "flac",
        "audio/mp4" | "audio/x-m4a" | "audio/aac" => "m4a",
        "audio/ogg" | "audio/vorbis" => "ogg",
        "audio/wav" | "audio/x-wav" => "wav",
        "audio/aiff" | "audio/x-aiff" => "aiff",
        "audio/opus" => "opus",
        _ => "mp3",
    }
}
