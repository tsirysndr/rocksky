use std::{collections::BTreeMap, env, sync::Arc};

use actix_web::HttpResponse;
use anyhow::Error;
use serde_json::json;

use crate::{auth::{authenticate_v1, generate_session_id}, cache::Cache, params::validate_required_params};

pub async fn authenticate(
    params: BTreeMap<String, String>,
    cache: &Cache,
    pool: &Arc<sqlx::Pool<sqlx::Postgres>>,
) -> Result<HttpResponse, Error> {
  match validate_required_params(&params, &["hs", "u", "t", "a"]) {
        Ok(_) => {
            let u = params.get("u").unwrap().to_string();
            let t = params.get("t").unwrap().to_string();
            let a = params.get("a").unwrap().to_string();

            let scrobbler_origin_url = env::var("SCROBBLER_ORIGIN_URL").unwrap_or_else(|_| "https://audioscrobbler.rocksky.app".to_string());

            if authenticate_v1(&pool, &u, &t, &a).await.is_err() {
                return Ok(HttpResponse::Unauthorized().json(json!({
                    "error": 2,
                    "message": "Authentication failed"
                })));
            }

            let session_id = generate_session_id(
                pool,
                cache,
                &u,
            );

            let session_id = session_id.await;
            if session_id.is_err() {
                return Ok(HttpResponse::InternalServerError().json(json!({
                    "error": 3,
                    "message": "Failed to generate session ID"
                })));
            }

            let session_id = session_id.unwrap();

            let now_playing_url = format!("{}/nowplaying", scrobbler_origin_url);
            let submission_url = format!("{}/submission", scrobbler_origin_url);
            Ok(HttpResponse::Ok().body(format!("OK\n{}\n{}\n{}", session_id, now_playing_url, submission_url)))
        }
        Err(e) => {
             Ok(HttpResponse::BadRequest().json(json!({
                "error": 5,
                "message": format!("{}", e)
            })))
        }
    }
}
