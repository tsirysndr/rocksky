use std::{collections::BTreeMap, sync::Arc};

use actix_web::HttpResponse;
use anyhow::Error;
use owo_colors::OwoColorize;
use serde_json::json;

use crate::{auth::verify_session_id, cache::Cache, params::validate_required_params};

pub fn nowplaying(
    form: BTreeMap<String, String>,
    cache: &Cache,
    _conn: &Arc<sqlx::Pool<sqlx::Postgres>>,
) -> Result<HttpResponse, Error> {
    match validate_required_params(&form, &["s", "a", "t"]) {
        Ok(_) => {
            let s = form.get("s").unwrap().to_string();
            let a = form.get("a").unwrap().to_string();
            let t = form.get("t").unwrap().to_string();

            println!("Now playing: {} - {} {}", a, t, s.cyan());

            let user_id = verify_session_id(cache, &s);
            if let Err(e) = user_id {
                return Ok(HttpResponse::Unauthorized().json(json!({
                    "error": 2,
                    "message": format!("Authentication failed: {}", e)
                })));
            }

            Ok(HttpResponse::Ok().body("OK\n"))
        }
        Err(e) => {
            return Ok(HttpResponse::BadRequest().json(json!({
                "error": 5,
                "message": format!("{}", e)
            })));
        }
    }
}
