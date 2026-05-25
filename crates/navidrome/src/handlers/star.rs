use actix_web::HttpResponse;
use serde_json::json;
use sqlx::{Pool, Postgres};
use std::{collections::HashMap, sync::Arc};

use crate::{repo, response};

pub async fn handle_star(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &HashMap<String, String>,
) -> HttpResponse {
    if let Some(id) = params.get("id") {
        match repo::scrobble::star_track(pool, user_id, id).await {
            Ok(_) => {}
            Err(e) => {
                tracing::error!("star error: {}", e);
                return response::err(format, 0, "Internal server error");
            }
        }
    }
    // albumId and artistId starring is silently accepted (no DB support yet)
    response::ok(format, json!({}))
}

pub async fn handle_unstar(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &HashMap<String, String>,
) -> HttpResponse {
    if let Some(id) = params.get("id") {
        match repo::scrobble::unstar_track(pool, user_id, id).await {
            Ok(_) => {}
            Err(e) => {
                tracing::error!("unstar error: {}", e);
                return response::err(format, 0, "Internal server error");
            }
        }
    }
    response::ok(format, json!({}))
}
