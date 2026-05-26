use actix_web::HttpResponse;
use chrono::{DateTime, TimeZone, Utc};
use serde_json::json;
use sqlx::{Pool, Postgres};
use std::{collections::HashMap, sync::Arc};

use crate::{api, repo, response};

pub async fn publish_song_changed(
    pool: &Arc<Pool<Postgres>>,
    nc: &Arc<async_nats::Client>,
    user_id: &str,
    song_id: &str,
) {
    let pool_clone = Arc::clone(pool);
    let nc_clone = Arc::clone(nc);
    let user_id_owned = user_id.to_string();
    let song_id_owned = song_id.to_string();
    tokio::spawn(async move {
        let did = match repo::user::get_user_did_by_id(&pool_clone, &user_id_owned).await {
            Ok(Some(d)) => d,
            Ok(None) => {
                tracing::warn!(user_id = %user_id_owned, "DID not found, skipping song.changed");
                return;
            }
            Err(e) => {
                tracing::warn!(user_id = %user_id_owned, "DID lookup error: {}", e);
                return;
            }
        };

        let track =
            match repo::track::get_track_by_id(&pool_clone, &song_id_owned, &user_id_owned).await {
                Ok(Some(t)) => t,
                Ok(None) => {
                    tracing::warn!(song_id = %song_id_owned, "track not found for song.changed");
                    return;
                }
                Err(e) => {
                    tracing::warn!(song_id = %song_id_owned, "track lookup error: {}", e);
                    return;
                }
            };

        // Build the track object without null fields — the ATProto lexicon
        // defines optional string fields as non-nullable, so JSON null would
        // cause a 400 from the PDS. JS `undefined` is omitted from JSON but
        // Rust `Option::None` serializes as explicit `null` via serde_json.
        let mut track_obj = json!({
            "name": track.title,
            "artist": track.artist,
            "album": track.album,
            "duration_ms": (track.duration as i64) * 1000,
            "source": "navidrome",
        });
        if let Some(art) = &track.album_art {
            track_obj["albumCoverUrl"] = serde_json::Value::String(art.clone());
        }

        let payload = json!({ "did": did, "track": track_obj });
        tracing::info!(did = %did, payload = %payload, "publishing song.changed");

        match nc_clone
            .publish(
                "rocksky.song.changed",
                bytes::Bytes::from(payload.to_string()),
            )
            .await
        {
            Ok(_) => tracing::info!(did = %did, title = %track.title, "song.changed published"),
            Err(e) => tracing::warn!(did = %did, "song.changed publish error: {}", e),
        }
    });
}

pub async fn handle_scrobble(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &HashMap<String, String>,
    nc: &Arc<async_nats::Client>,
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
        // submission=false means "track started playing now" — emit song.changed
        tracing::info!(user_id, song_id, "now playing update (not a submission)");
        publish_song_changed(pool, nc, user_id, song_id).await;
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

    let track = match repo::track::get_track_by_id(pool, song_id, user_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return response::err(format, 70, "Song not found"),
        Err(e) => {
            tracing::error!("scrobble track lookup error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    };

    // Do NOT insert into `scrobbles` directly — the API's scrobbleTrack owns
    // the full pipeline (dedup check → ATProto records → DB write with URI).
    // A direct insert here would be found by the duplicate check and cause
    // scrobbleTrack to exit early, leaving uri = NULL forever.
    let pool_clone = Arc::clone(pool);
    let user_id_owned = user_id.to_string();
    let timestamp_unix = timestamp.timestamp();
    tokio::spawn(async move {
        match repo::user::get_user_did_by_id(&pool_clone, &user_id_owned).await {
            Ok(Some(did)) => {
                api::post_now_playing(did, track, timestamp_unix).await;
            }
            Ok(None) => {
                tracing::warn!(user_id = %user_id_owned, "DID not found, skipping ATProto publish");
            }
            Err(e) => {
                tracing::warn!(user_id = %user_id_owned, "DID lookup error: {}", e);
            }
        }
    });

    tracing::info!(user_id, song_id, "scrobble queued for ATProto publish");
    response::ok(format, json!({}))
}

pub async fn handle_update_now_playing(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &HashMap<String, String>,
    nc: &Arc<async_nats::Client>,
) -> HttpResponse {
    let song_id = match params.get("id") {
        Some(id) => id.as_str(),
        None => return response::err(format, 10, "Missing id parameter"),
    };

    match repo::track::get_track_by_id(pool, song_id, user_id).await {
        Ok(Some(_)) => {
            tracing::info!(user_id, song_id, "now playing updated");
            publish_song_changed(pool, nc, user_id, song_id).await;
            response::ok(format, json!({}))
        }
        Ok(None) => response::err(format, 70, "Song not found"),
        Err(e) => {
            tracing::error!("updateNowPlaying error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}
