use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::{collections::HashMap, sync::Arc};

use crate::{handlers::songs::track_to_json, repo, response};

pub async fn handle_get_play_queue(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    let queue = match repo::playqueue::get_play_queue(pool, user_id).await {
        Ok(q) => q,
        Err(e) => {
            tracing::error!("getPlayQueue error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    };

    let Some(queue) = queue else {
        return response::ok(format, json!({ "playQueue": {} }));
    };

    // Fetch track details for each queued track ID
    let mut entries: Vec<Value> = Vec::new();
    for track_id in &queue.track_ids {
        if let Ok(Some(track)) = repo::track::get_track_by_id(pool, track_id, user_id).await {
            entries.push(track_to_json(&track, user_id));
        }
    }

    let mut pq = json!({
        "entry": entries,
        "position": queue.position_ms,
        "changed": queue.changed_at.to_rfc3339(),
        "changedBy": queue.changed_by,
    });

    if let Some(current) = &queue.current_track_id {
        pq["current"] = json!(current);
    }

    response::ok(format, json!({ "playQueue": pq }))
}

pub async fn handle_save_play_queue(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &HashMap<String, String>,
) -> HttpResponse {
    // Collect all `id` values — clients send multiple id params for the queue order.
    // actix Query only captures the last value per key, so we also check id[] and
    // fall back to a comma-separated list if the client serialised it that way.
    let track_ids: Vec<String> = params
        .get("id")
        .map(|v| {
            v.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let current = params.get("current").map(|s| s.as_str());
    let position_ms: i64 = params
        .get("position")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let changed_by = params.get("c").map(|s| s.as_str()).unwrap_or("unknown");

    match repo::playqueue::save_play_queue(
        pool,
        user_id,
        &track_ids,
        current,
        position_ms,
        changed_by,
    )
    .await
    {
        Ok(_) => response::ok(format, json!({})),
        Err(e) => {
            tracing::error!("savePlayQueue error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}
