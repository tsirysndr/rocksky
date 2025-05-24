use std::sync::Arc;
use anyhow::Error;
use actix_web::HttpResponse;
use owo_colors::OwoColorize;
use serde_json::json;

use crate::{cache::Cache, scrobbler::scrobble_listenbrainz};

use super::types::SubmitListensRequest;

pub async fn submit_listens(
  payload: SubmitListensRequest,
  cache: &Cache,
  pool: &Arc<sqlx::Pool<sqlx::Postgres>>,
  token: &str
) -> Result<HttpResponse, Error> {
  if payload.listen_type != "single" {
    println!("skipping listen type: {}", payload.listen_type.cyan());
    return Ok(HttpResponse::Ok().json(
      json!({
        "status": "ok",
        "payload": {
          "submitted_listens": 0,
          "ignored_listens": 1
        },
      })
    ));
  }
  match scrobble_listenbrainz(pool, cache, payload, token)
    .await {
    Ok(_) => Ok(HttpResponse::Ok().json(
      json!({
        "status": "ok",
        "payload": {
          "submitted_listens": 1,
          "ignored_listens": 0
        },
      })
    )),
    Err(e) => {
      println!("Error submitting listens: {}", e);
      Ok(HttpResponse::BadRequest().json(
        serde_json::json!({
          "error": 4,
          "message": format!("Failed to parse listens: {}", e)
        })
      ))
    }
  }
}
