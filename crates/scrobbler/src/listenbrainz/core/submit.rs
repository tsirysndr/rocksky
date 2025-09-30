use actix_web::HttpResponse;
use anyhow::Error;
use owo_colors::OwoColorize;
use serde_json::json;
use std::sync::Arc;

use crate::auth::decode_token;
use crate::musicbrainz::client::MusicbrainzClient;
use crate::repo;
use crate::{cache::Cache, scrobbler::scrobble_listenbrainz};

use crate::listenbrainz::types::SubmitListensRequest;

pub async fn submit_listens(
    payload: SubmitListensRequest,
    cache: &Cache,
    pool: &Arc<sqlx::Pool<sqlx::Postgres>>,
    mb_client: &Arc<MusicbrainzClient>,
    token: &str,
) -> Result<HttpResponse, Error> {
    if payload.listen_type != "single" {
        tracing::info!(listen_type = %payload.listen_type.cyan(), "Skipping listen type");
        return Ok(HttpResponse::Ok().json(json!({
          "status": "ok",
          "payload": {
            "submitted_listens": 0,
            "ignored_listens": 1
          },
        })));
    }

    const RETRIES: usize = 15;
    for attempt in 1..=RETRIES {
        match scrobble_listenbrainz(pool, cache, mb_client, &payload, token).await {
            Ok(_) => {
                return Ok(HttpResponse::Ok().json(json!({
                  "status": "ok",
                  "payload": {
                    "submitted_listens": 1,
                    "ignored_listens": 0
                  },
                })));
            }
            Err(e) => {
                let artist = payload.payload[0].track_metadata.artist_name.clone();
                let track = payload.payload[0].track_metadata.track_name.clone();

                let did = match decode_token(token) {
                    Ok(claims) => claims.did,
                    Err(e) => {
                        let user = repo::user::get_user_by_apikey(pool, token)
                            .await?
                            .map(|user| user.did);
                        if let Some(did) = user {
                            did
                        } else {
                            return Err(Error::msg(format!(
                                "Failed to decode token: {} {}",
                                e, token
                            )));
                        }
                    }
                };

                cache.del(&format!("listenbrainz:cache:{}:{}:{}", artist, track, did))?;

                tracing::error!(error = %e, attempt = attempt, "Retryable error submitting listens for {} - {} (attempt {}/{})", artist, track, attempt, RETRIES);

                if attempt == RETRIES {
                    return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                      "error": 4,
                      "message": format!("Failed to parse listens after {} attempts: {}", RETRIES, e)
                    })));
                }

                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    }

    unreachable!();

    /* match scrobble_listenbrainz(pool, cache, payload, token).await {
        Ok(_) => Ok(HttpResponse::Ok().json(json!({
          "status": "ok",
          "payload": {
            "submitted_listens": 1,
            "ignored_listens": 0
          },
        }))),
        Err(e) => {
            println!("Error submitting listens: {}", e);
            Ok(HttpResponse::BadRequest().json(serde_json::json!({
              "error": 4,
              "message": format!("Failed to parse listens: {}", e)
            })))
        }
    }
    */
}
