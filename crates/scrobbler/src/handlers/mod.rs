use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use anyhow::Error;
use scrobble::handle_scrobble;
use sqlx::{Pool, Postgres};
use std::collections::BTreeMap;
use std::sync::Arc;
use tokio_stream::StreamExt;
use v1::authenticate::authenticate;
use v1::nowplaying::nowplaying;
use v1::submission::submission;

use crate::cache::Cache;
use crate::listenbrainz::core::submit::submit_listens;
use crate::listenbrainz::types::SubmitListensRequest;
use crate::{repo, BANNER};

pub mod scrobble;
pub mod v1;

#[macro_export]
macro_rules! read_payload {
    ($payload:expr) => {{
        let mut body = Vec::new();
        while let Some(chunk) = $payload.next().await {
            match chunk {
                Ok(bytes) => body.extend_from_slice(&bytes),
                Err(err) => return Err(err.into()),
            }
        }
        body
    }};
}

#[get("/")]
pub async fn index(
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    params: web::Query<BTreeMap<String, String>>,
) -> impl Responder {
    if params.is_empty() {
        return Ok(HttpResponse::Ok().body(BANNER));
    }

    authenticate(params.into_inner(), cache.get_ref(), data.get_ref())
        .await
        .map_err(actix_web::error::ErrorInternalServerError)
}

#[post("/nowplaying")]
pub async fn handle_nowplaying(
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    form: web::Form<BTreeMap<String, String>>,
) -> impl Responder {
    nowplaying(form.into_inner(), cache.get_ref(), data.get_ref())
        .map_err(actix_web::error::ErrorInternalServerError)
}

#[post("/submission")]
pub async fn handle_submission(
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    form: web::Form<BTreeMap<String, String>>,
) -> impl Responder {
    submission(form.into_inner(), cache.get_ref(), data.get_ref())
        .await
        .map_err(actix_web::error::ErrorInternalServerError)
}

#[get("/2.0")]
pub async fn handle_get() -> impl Responder {
    HttpResponse::Ok().body(BANNER)
}

#[post("/2.0")]
pub async fn handle_methods(
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    form: web::Form<BTreeMap<String, String>>,
) -> impl Responder {
    let conn = data.get_ref();
    let cache = cache.get_ref();

    let method = form.get("method").unwrap_or(&"".to_string()).to_string();
    call_method(&method, conn, cache, form.into_inner())
        .await
        .map_err(actix_web::error::ErrorInternalServerError)
}

#[post("/1/submit-listens")]
pub async fn handle_submit_listens(
    req: HttpRequest,
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    mut payload: web::Payload,
) -> impl Responder {
    let token = match req.headers().get("Authorization") {
        Some(header) => header.to_str().map_err(actix_web::error::ErrorBadRequest)?,
        None => return Ok(HttpResponse::Unauthorized().finish()),
    };
    let token = token.trim_start_matches("Token ");
    let token = token.trim_start_matches("Bearer ");
    let token = token.trim_start_matches("token ");
    let token = token.trim_start_matches("bearer ");

    if token.is_empty() {
        return Ok(HttpResponse::Unauthorized().finish());
    }

    let payload = read_payload!(payload);
    let body = String::from_utf8_lossy(&payload);
    let req = serde_json::from_str::<SubmitListensRequest>(&body)
        .map_err(|e| {
            println!("{}", body);
            println!("Error parsing request body: {}", e);
            e
        })
        .map_err(actix_web::error::ErrorBadRequest)?;

    submit_listens(req, cache.get_ref(), data.get_ref(), token)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)
}

#[get("/1/validate-token")]
pub async fn handle_validate_token(
    data: web::Data<Arc<Pool<Postgres>>>,
    req: HttpRequest,
) -> impl Responder {
    let pool = data.get_ref();
    let authorization = req.headers().get("Authorization");

    if authorization.is_none() {
        return HttpResponse::Ok().json(serde_json::json!({
            "code": 200,
            "message": "Token valid.",
            "valid": true,
        }));
    }

    let authorization = authorization.unwrap();
    let token = match authorization.to_str() {
        Ok(token) => token
            .trim_start_matches("Token ")
            .trim_start_matches("Bearer ")
            .trim_start_matches("token ")
            .trim_start_matches("bearer "),
        Err(_) => return HttpResponse::Unauthorized().finish(),
    };

    match repo::user::get_user_by_apikey(pool, token).await {
        Ok(Some(user)) => {
            return HttpResponse::Ok().json(serde_json::json!({
                "code": 200,
                "message": "Token valid.",
                "valid": true,
                "user_name": user.handle,
                "permissions": vec![
                    "recording-metadata-write",
                    "recording-metadata-read"
                ],
            }));
        }
        Ok(None) => {
            return HttpResponse::Ok().json(serde_json::json!({
                "code": 200,
                "message": "Token invalid.",
                "valid": false,
            }));
        }
        Err(e) => {
            println!("Error validating token: {}", e);
            return HttpResponse::InternalServerError().finish();
        }
    }
}

pub async fn call_method(
    method: &str,
    pool: &Arc<Pool<Postgres>>,
    cache: &Cache,
    form: BTreeMap<String, String>,
) -> Result<HttpResponse, Error> {
    match method {
        "track.scrobble" => handle_scrobble(form, pool, cache).await,
        _ => Err(Error::msg(format!("Unsupported method: {}", method))),
    }
}
