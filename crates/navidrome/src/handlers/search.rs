use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::{collections::HashMap, sync::Arc};

use crate::{handlers::songs::track_to_json, repo, response};

pub async fn handle_search3(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &HashMap<String, String>,
) -> HttpResponse {
    let query = match params.get("query") {
        Some(q) if !q.is_empty() => q.as_str(),
        _ => return response::err(format, 10, "Missing query parameter"),
    };

    let artist_count: i64 = params
        .get("artistCount")
        .and_then(|s| s.parse().ok())
        .unwrap_or(20);
    let artist_offset: i64 = params
        .get("artistOffset")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let album_count: i64 = params
        .get("albumCount")
        .and_then(|s| s.parse().ok())
        .unwrap_or(20);
    let album_offset: i64 = params
        .get("albumOffset")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let song_count: i64 = params
        .get("songCount")
        .and_then(|s| s.parse().ok())
        .unwrap_or(20);
    let song_offset: i64 = params
        .get("songOffset")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let artists_fut =
        repo::artist::search_artists(pool, user_id, query, artist_count, artist_offset);
    let albums_fut = repo::album::search_albums(pool, user_id, query, album_count, album_offset);
    let songs_fut = repo::track::search_tracks(pool, user_id, query, song_count, song_offset);

    let (artists, albums, songs) = tokio::join!(artists_fut, albums_fut, songs_fut);

    let artist_list: Vec<Value> = artists
        .unwrap_or_default()
        .iter()
        .map(|a| {
            let mut obj = json!({
                "id": a.xata_id,
                "name": a.name,
                "albumCount": a.album_count,
            });
            if let Some(pic) = &a.picture {
                obj["artistImageUrl"] = json!(pic);
                obj["coverArt"] = json!(format!("ar-{}", a.xata_id));
            }
            obj
        })
        .collect();

    let album_list: Vec<Value> = albums
        .unwrap_or_default()
        .iter()
        .map(|a| {
            let mut obj = json!({
                "id": a.xata_id,
                "name": a.title,
                "title": a.title,
                "artist": a.artist,
                "songCount": a.song_count,
                "duration": a.total_duration.unwrap_or(0) / 1000,
                "created": a.created_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
            });
            if let Some(aid) = &a.artist_id {
                obj["artistId"] = json!(aid);
            }
            if let Some(year) = a.year {
                obj["year"] = json!(year);
            }
            if a.album_art.is_some() {
                obj["coverArt"] = json!(format!("al-{}", a.xata_id));
            }
            obj
        })
        .collect();

    let song_list: Vec<Value> = songs
        .unwrap_or_default()
        .iter()
        .map(|t| track_to_json(t, user_id))
        .collect();

    response::ok(
        format,
        json!({
            "searchResult3": {
                "artist": artist_list,
                "album": album_list,
                "song": song_list,
            }
        }),
    )
}
