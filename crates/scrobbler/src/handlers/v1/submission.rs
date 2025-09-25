use actix_web::HttpResponse;
use anyhow::Error;
use serde_json::json;
use std::{collections::BTreeMap, sync::Arc};

use crate::{
    auth::verify_session_id, cache::Cache, params::validate_required_params, scrobbler::scrobble_v1,
};

pub async fn submission(
    form: BTreeMap<String, String>,
    cache: &Cache,
    pool: &Arc<sqlx::Pool<sqlx::Postgres>>,
) -> Result<HttpResponse, Error> {
    match validate_required_params(&form, &["s", "a[0]", "t[0]", "i[0]"]) {
        Ok(_) => {
            let s = form.get("s").unwrap().to_string();
            let a = form.get("a[0]").unwrap().to_string();
            let t = form.get("t[0]").unwrap().to_string();
            let i = form.get("i[0]").unwrap().to_string();

            let user_id = verify_session_id(cache, &s);
            if let Err(e) = user_id {
                return Ok(HttpResponse::Unauthorized().json(json!({
                    "error": 2,
                    "message": format!("Authentication failed: {}", e)
                })));
            }

            let user_id = user_id.unwrap();
            tracing::info!(artist = %a, track = %t, timestamp = %i, user_id = %user_id, "Submission");

            match scrobble_v1(pool, cache, &form).await {
                Ok(_) => Ok(HttpResponse::Ok().body("OK\n")),
                Err(e) => Ok(HttpResponse::BadRequest().json(json!({
                    "error": 4,
                    "message": format!("Failed to parse scrobbles: {}", e)
                }))),
            }
        }
        Err(e) => Ok(HttpResponse::BadRequest().json(json!({
            "error": 5,
            "message": format!("{}", e)
        }))),
    }
}
