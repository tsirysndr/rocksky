use actix_web::{get, post, web, HttpResponse, Responder};
use owo_colors::OwoColorize;
use serde_json::json;
use sqlx::{Pool, Postgres};
use std::collections::BTreeMap;
use std::env;
use std::sync::Arc;
use crate::auth::{authenticate, authenticate_v1, generate_session_id, verify_session_id};
use crate::cache::Cache;
use crate::params::{validate_handshake_params, validate_nowplaying_params, validate_required_params, validate_submission_params};
use crate::response::build_response;
use crate::scrobbler::{scrobble, scrobble_v1};
use crate::BANNER;


#[get("/")]
pub async fn index(
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    params: web::Query<BTreeMap<String, String>>,
) -> impl Responder {
    if params.is_empty() {
        return HttpResponse::Ok().body(BANNER);
    }

    match validate_handshake_params(&params, &["hs", "u", "t", "a"]) {
        Ok(_) => {
            let u = params.get("u").unwrap().to_string();
            let t = params.get("t").unwrap().to_string();
            let a = params.get("a").unwrap().to_string();

            let cache = cache.get_ref().clone();
            let pool = data.get_ref().clone();

            let scrobbler_origin_url = env::var("SCROBBLER_ORIGIN_URL").unwrap_or_else(|_| "https://audioscrobbler.rocksky.app".to_string());

            if authenticate_v1(&pool, &u, &t, &a).await.is_err() {
                return HttpResponse::Unauthorized().json(json!({
                    "error": 2,
                    "message": "Authentication failed"
                }));
            }

            let session_id = generate_session_id(
                &pool,
                &cache,
                &u,
            );

            let session_id = session_id.await;
            if session_id.is_err() {
                return HttpResponse::InternalServerError().json(json!({
                    "error": 3,
                    "message": "Failed to generate session ID"
                }));
            }

            let session_id = session_id.unwrap();

            let now_playing_url = format!("{}/nowplaying", scrobbler_origin_url);
            let submission_url = format!("{}/submission", scrobbler_origin_url);
            HttpResponse::Ok().body(format!("OK\n{}\n{}\n{}", session_id, now_playing_url, submission_url))
        }
        Err(e) => {
             HttpResponse::BadRequest().json(json!({
                "error": 5,
                "message": format!("{}", e)
            }))
        }
    }
}

#[post("/nowplaying")]
pub async fn handle_nowplaying(
    cache: web::Data<Cache>,
    form: web::Form<BTreeMap<String, String>>,
) -> impl Responder {
    match validate_nowplaying_params(&form, &["s", "a", "t"]) {
        Ok(_) => {
            let s = form.get("s").unwrap().to_string();
            let a = form.get("a").unwrap().to_string();
            let t = form.get("t").unwrap().to_string();

            println!("Now playing: {} - {} {}", a, t, s.cyan());

            let cache = cache.get_ref().clone();
            let user_id = verify_session_id(&cache, &s);
            if let Err(e) = user_id {
                return HttpResponse::Unauthorized().json(json!({
                    "error": 2,
                    "message": format!("Authentication failed: {}", e)
                }));
            }

            HttpResponse::Ok().body("OK\n")
        }
        Err(e) => {
            return HttpResponse::BadRequest().json(json!({
                "error": 5,
                "message": format!("{}", e)
            }));
        }
    }

}

#[post("/submission")]
pub async fn handle_submission(
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    form: web::Form<BTreeMap<String, String>>,
) -> impl Responder {
    match validate_submission_params(&form, &["s", "a[0]", "t[0]", "i[0]"]) {
        Ok(_) => {
            let s = form.get("s").unwrap().to_string();
            let a = form.get("a[0]").unwrap().to_string();
            let t = form.get("t[0]").unwrap().to_string();
            let i = form.get("i[0]").unwrap().to_string();

            let cache = cache.get_ref().clone();
            let user_id = verify_session_id(&cache, &s);
            if let Err(e) = user_id {
                return HttpResponse::Unauthorized().json(json!({
                    "error": 2,
                    "message": format!("Authentication failed: {}", e)
                }));
            }

            let user_id = user_id.unwrap();
            println!("Submission: {} - {} {} {} {}", a, t, i, user_id, s.cyan());

            let pool = data.get_ref().clone();

            match scrobble_v1(&pool, &cache, &form).await {
                Ok(_) => HttpResponse::Ok().body("OK\n"),
                Err(e) => HttpResponse::BadRequest().json(json!({
                    "error": 4,
                    "message": format!("Failed to parse scrobbles: {}", e)
                })),
            }
        }
        Err(e) => {
            HttpResponse::BadRequest().json(json!({
                "error": 5,
                "message": format!("{}", e)
            }))
        }
    }
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
