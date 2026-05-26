use actix_web::HttpResponse;
use serde_json::json;
use sqlx::{Pool, Postgres};
use std::{collections::HashMap, sync::Arc};

use crate::{api, repo, response};

pub async fn handle_star(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &HashMap<String, String>,
) -> HttpResponse {
    let track_id = match params.get("id") {
        Some(id) => id.as_str(),
        None => return response::ok(format, json!({})),
    };

    match repo::scrobble::star_track(pool, user_id, track_id).await {
        Ok(_) => {}
        Err(e) => {
            tracing::error!("star error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    }

    // Publish ATProto like record via the Rocksky API
    let pool_clone = Arc::clone(pool);
    let user_id_owned = user_id.to_string();
    let track_id_owned = track_id.to_string();
    tokio::spawn(async move {
        let did = match repo::user::get_user_did_by_id(&pool_clone, &user_id_owned).await {
            Ok(Some(d)) => d,
            Ok(None) => {
                tracing::warn!(user_id = %user_id_owned, "DID not found, skipping like");
                return;
            }
            Err(e) => {
                tracing::warn!(user_id = %user_id_owned, "DID lookup error: {}", e);
                return;
            }
        };

        let track = match repo::track::get_track_by_id(&pool_clone, &track_id_owned, &user_id_owned)
            .await
        {
            Ok(Some(t)) => t,
            Ok(None) => {
                tracing::warn!(track_id = %track_id_owned, "track not found for like");
                return;
            }
            Err(e) => {
                tracing::warn!(track_id = %track_id_owned, "track lookup error: {}", e);
                return;
            }
        };

        api::post_like(did, track).await;
    });

    response::ok(format, json!({}))
}

pub async fn handle_unstar(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    params: &HashMap<String, String>,
) -> HttpResponse {
    let track_id = match params.get("id") {
        Some(id) => id.as_str(),
        None => return response::ok(format, json!({})),
    };

    match repo::scrobble::unstar_track(pool, user_id, track_id).await {
        Ok(_) => {}
        Err(e) => {
            tracing::error!("unstar error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    }

    // Delete ATProto like record via the Rocksky API
    let pool_clone = Arc::clone(pool);
    let user_id_owned = user_id.to_string();
    let track_id_owned = track_id.to_string();
    tokio::spawn(async move {
        let did = match repo::user::get_user_did_by_id(&pool_clone, &user_id_owned).await {
            Ok(Some(d)) => d,
            Ok(None) => {
                tracing::warn!(user_id = %user_id_owned, "DID not found, skipping unlike");
                return;
            }
            Err(e) => {
                tracing::warn!(user_id = %user_id_owned, "DID lookup error: {}", e);
                return;
            }
        };

        let track = match repo::track::get_track_by_id(&pool_clone, &track_id_owned, &user_id_owned)
            .await
        {
            Ok(Some(t)) => t,
            Ok(None) => {
                tracing::warn!(track_id = %track_id_owned, "track not found for unlike");
                return;
            }
            Err(e) => {
                tracing::warn!(track_id = %track_id_owned, "track lookup error: {}", e);
                return;
            }
        };

        let sha256 = {
            use sha2::{Digest, Sha256};
            let input = format!(
                "{} - {} - {}",
                track.title.to_lowercase(),
                track.artist.to_lowercase(),
                track.album.to_lowercase()
            );
            hex::encode(Sha256::digest(input.as_bytes()))
        };

        api::delete_like(did, sha256).await;
    });

    response::ok(format, json!({}))
}
