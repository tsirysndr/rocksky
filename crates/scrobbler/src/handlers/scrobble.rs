use std::collections::BTreeMap;
use actix_web::HttpResponse;
use anyhow::Error;
use serde_json::json;
use sqlx::Pool;

use crate::{auth::authenticate, cache::Cache, params::validate_scrobble_params, response::build_response, scrobbler::scrobble};

pub async fn handle_scrobble(
  form: BTreeMap<String, String>,
  conn: &Pool<sqlx::Postgres>,
  cache: &Cache,
) -> Result<HttpResponse, Error> {
  let params = match validate_scrobble_params(
        &form,
        &["api_key", "api_sig", "sk", "method"],
    ) {
        Ok(params) => params,
        Err(e) => {
            return Ok(HttpResponse::BadRequest().json(json!({
                "error": 5,
                "message": format!("{}", e)
            })));
        }
    };

    if let Err(e) = authenticate(
        conn,
        &params[0],
        &params[1],
        &params[2],
        &form
    ).await {
        return Ok(HttpResponse::Forbidden().json(json!({
            "error": 2,
            "message": format!("Authentication failed: {}", e)
        })));
    }

    match scrobble(&conn, cache, &form).await {
        Ok(scrobbles) => Ok(HttpResponse::Ok().json(build_response(scrobbles))),
        Err(e) => {
            if e.to_string().contains("Timestamp") {
                return Ok(HttpResponse::BadRequest().json(json!({
                    "error": 6,
                    "message": e.to_string()
                })));
            }
            Ok(
              HttpResponse::BadRequest().json(json!({
                "error": 4,
                "message": format!("Failed to parse scrobbles: {}", e)
          })))
        }
    }
}
