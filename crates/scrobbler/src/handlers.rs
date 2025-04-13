use actix_web::{get, post, web, HttpResponse, Responder};
use serde_json::json;
use sqlx::{Pool, Postgres};
use std::collections::BTreeMap;
use std::sync::Arc;
use crate::auth::authenticate;
use crate::cache::Cache;
use crate::params::validate_required_params;
use crate::response::build_response;
use crate::scrobbler::scrobble;
use crate::BANNER;


#[get("/")]
pub async fn index() -> impl Responder {
    HttpResponse::Ok().body(BANNER)
}

#[get("/2.0")]
pub async fn handle_get() -> impl Responder {
    HttpResponse::Ok().body(BANNER)
}

#[post("/2.0")]
pub async fn handle_scrobble(
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    form: web::Form<BTreeMap<String, String>>,
) -> impl Responder {
    let conn = data.get_ref().clone();
    let cache = cache.get_ref().clone();

    let params = match validate_required_params(
        &form,
        &["api_key", "api_sig", "sk", "method"],
    ) {
        Ok(params) => params,
        Err(e) => {
            return HttpResponse::BadRequest().json(json!({
                "error": 5,
                "message": format!("{}", e)
            }));
        }
    };

    if let Err(e) = authenticate(
        &conn,
        &params[0],
        &params[1],
        &params[2],
        &form
    ).await {
        return HttpResponse::Forbidden().json(json!({
            "error": 2,
            "message": format!("Authentication failed: {}", e)
        }));
    }

    match scrobble(&conn, &cache, &form).await {
        Ok(scrobbles) => HttpResponse::Ok().json(build_response(scrobbles)),
        Err(e) => {
            if e.to_string().contains("Timestamp") {
                return HttpResponse::BadRequest().json(json!({
                    "error": 6,
                    "message": e.to_string()
                }));
            }
            HttpResponse::BadRequest().json(json!({
            "error": 4,
            "message": format!("Failed to parse scrobbles: {}", e)
            }))
        }
    }
}
