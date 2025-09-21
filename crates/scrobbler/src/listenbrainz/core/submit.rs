use actix_web::HttpResponse;
use anyhow::{Context, Error};
use owo_colors::OwoColorize;
use serde_json::json;
use std::sync::Arc;

use crate::{cache::Cache, scrobbler::scrobble_listenbrainz};

use crate::listenbrainz::types::SubmitListensRequest;

pub async fn submit_listens(
    payload: SubmitListensRequest,
    cache: &Cache,
    pool: &Arc<sqlx::Pool<sqlx::Postgres>>,
    token: &str,
) -> Result<HttpResponse, Error> {
    if payload.listen_type != "playing_now" {
        println!("skipping listen type: {}", payload.listen_type.cyan());
        return Ok(HttpResponse::Ok().json(json!({
          "status": "ok",
          "payload": {
            "submitted_listens": 0,
            "ignored_listens": 1
          },
        })));
    }

    const RETRIES: usize = 5;
    for attempt in 1..=RETRIES {
        match scrobble_listenbrainz(pool, cache, &payload, token)
            .await
            .with_context(|| format!("Attempt {}/{}: Error submitting listens", attempt, RETRIES))
        {
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
                println!(
                    "Retryable error on attempt {}/{}: {}",
                    attempt,
                    RETRIES,
                    e.to_string().yellow()
                );
                println!("{:#?}", payload);

                if attempt == RETRIES {
                    return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                      "error": 4,
                      "message": format!("Failed to parse listens after {} attempts: {}", RETRIES, e)
                    })));
                }

                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
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
