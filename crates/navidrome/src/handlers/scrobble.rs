use actix_web::HttpResponse;
use chrono::{DateTime, TimeZone, Utc};
use serde_json::json;
use sqlx::{Pool, Postgres};
use std::{collections::HashMap, sync::Arc};

use crate::{repo, response};

pub async fn handle_scrobble(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &HashMap<String, String>,
) -> HttpResponse {
    let song_id = match params.get("id") {
        Some(id) => id.as_str(),
        None => return response::err(format, 10, "Missing id parameter"),
    };

    let submission = params
        .get("submission")
        .map(|s| s != "false")
        .unwrap_or(true);

    if !submission {
        // Now-playing update — acknowledge without persisting
        tracing::info!(user_id, song_id, "now playing update");
        return response::ok(format, json!({}));
    }

    let timestamp: DateTime<Utc> = params
        .get("time")
        .and_then(|s| s.parse::<i64>().ok())
        .map(|ms| {
            Utc.timestamp_millis_opt(ms)
                .single()
                .unwrap_or_else(Utc::now)
        })
        .unwrap_or_else(Utc::now);

    let album_id = repo::track::get_album_id_for_track(pool, song_id)
        .await
        .ok()
        .flatten();
    let artist_id = repo::track::get_artist_id_for_track(pool, song_id)
        .await
        .ok()
        .flatten();

    match repo::scrobble::create_scrobble(
        pool,
        user_id,
        song_id,
        album_id.as_deref(),
        artist_id.as_deref(),
        timestamp,
    )
    .await
    {
        Ok(_) => {
            tracing::info!(user_id, song_id, "scrobble recorded");
            response::ok(format, json!({}))
        }
        Err(e) => {
            tracing::error!("scrobble error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}

pub async fn handle_update_now_playing(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &HashMap<String, String>,
) -> HttpResponse {
    let song_id = match params.get("id") {
        Some(id) => id.as_str(),
        None => return response::err(format, 10, "Missing id parameter"),
    };

    // Verify the track exists and belongs to the user
    match repo::track::get_track_by_id(pool, song_id, user_id).await {
        Ok(Some(_)) => {
            tracing::info!(user_id, song_id, "now playing updated");
            response::ok(format, json!({}))
        }
        Ok(None) => response::err(format, 70, "Song not found"),
        Err(e) => {
            tracing::error!("updateNowPlaying error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}
