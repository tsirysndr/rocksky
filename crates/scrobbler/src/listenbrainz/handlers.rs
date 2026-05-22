use std::sync::Arc;

use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use sqlx::{Pool, Postgres};

use crate::{
    auth::{decode_token, validate_bearer_token},
    cache::Cache,
    events::Events,
    listenbrainz::{
        core::{
            listen_count::get_listen_count, listens::get_listens, playing_now::get_playing_now,
            search_users::search_users, submit::submit_listens,
        },
        statistics::{
            artists::get_top_artists, recordings::get_top_recordings,
            release_groups::get_top_release_groups, releases::get_top_releases,
        },
        types::SubmitListensRequest,
    },
    musicbrainz::client::MusicbrainzClient,
    repo,
};
use tokio_stream::StreamExt;

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

#[post("/1/submit-listens")]
pub async fn handle_submit_listens(
    req: HttpRequest,
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    mb_client: web::Data<Arc<MusicbrainzClient>>,
    events: web::Data<Arc<Events>>,
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

    let is_kodi = req
        .headers()
        .get("User-Agent")
        .and_then(|v| v.to_str().ok())
        .map(|ua| ua.to_lowercase().contains("kodi"))
        .unwrap_or(false);

    let pool = data.get_ref();
    validate_bearer_token(pool, token).await.map_err(|e| {
        let msg = e.to_string();
        if msg.contains("pool timed out") {
            actix_web::error::ErrorServiceUnavailable(msg)
        } else {
            actix_web::error::ErrorUnauthorized(format!("Invalid token: {}", msg))
        }
    })?;

    let payload = read_payload!(payload);
    let body = String::from_utf8_lossy(&payload);
    let mut req = serde_json::from_str::<SubmitListensRequest>(&body)
        .map_err(|e| {
            tracing::error!(body = %body, error = %e, "Error parsing request body");
            e
        })
        .map_err(actix_web::error::ErrorBadRequest)?;

    if req.listen_type == "playing_now" {
        if let Some(listen) = req.payload.first() {
            let pool = data.get_ref();
            let did = match decode_token(token) {
                Ok(claims) => Some(claims.did),
                Err(_) => match repo::user::get_user_by_apikey(pool, token).await {
                    Ok(Some(user)) => Some(user.did),
                    _ => None,
                },
            };

            if let Some(did) = did {
                let meta = &listen.track_metadata;
                let duration_ms = meta
                    .additional_info
                    .as_ref()
                    .and_then(|i| i.duration_ms)
                    .unwrap_or(0.0) as u64;

                let track = serde_json::json!({
                    "name": meta.track_name,
                    "artist": meta.artist_name,
                    "album": meta.release_name,
                    "duration_ms": duration_ms,
                });

                events.emit_song_changed(&did, track).await;
                events.schedule_song_stopped(did, duration_ms).await;
            }
        }
    }

    if is_kodi && req.listen_type == "playing_now" {
        req.listen_type = "single".to_string();
    }

    let mb_client = mb_client.get_ref();
    submit_listens(req, cache.get_ref(), data.get_ref(), &mb_client, token)
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
            tracing::error!(error = %e, "Error validating token");
            return HttpResponse::InternalServerError().finish();
        }
    }
}

#[get("/1/search/users")]
pub async fn handle_search_users(
    query: web::Query<String>,
    data: web::Data<Arc<Pool<Postgres>>>,
) -> impl Responder {
    let _pool = data.get_ref();
    let query = query.into_inner();

    match search_users(&query).await {
        Ok(users) => HttpResponse::Ok().json(users),
        Err(e) => {
            tracing::error!(error = %e, "Error searching users");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[get("/1/user/{user_name}/listens")]
pub async fn handle_get_listens(user_name: web::Path<String>) -> impl Responder {
    let user_name = user_name.into_inner();
    match get_listens(&user_name).await {
        Ok(listens) => HttpResponse::Ok().json(listens),
        Err(e) => {
            tracing::error!(error = %e, "Error getting listens for user {}", user_name);
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[get("/1/user/{user_name}/listen-count")]
pub async fn handle_get_listen_count(user_name: web::Path<String>) -> impl Responder {
    let user_name = user_name.into_inner();
    match get_listen_count(&user_name).await {
        Ok(count) => HttpResponse::Ok().json(count),
        Err(e) => {
            tracing::error!(error = %e, "Error getting listen count for user {}", user_name);
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[get("/1/user/{user_name}/playing-now")]
pub async fn handle_get_playing_now(user_name: web::Path<String>) -> impl Responder {
    let user_name = user_name.into_inner();
    match get_playing_now(&user_name).await {
        Ok(playing_now) => HttpResponse::Ok().json(playing_now),
        Err(e) => {
            tracing::error!(error = %e, "Error getting playing now for user {}", user_name);
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[get("/1/stats/user/{user_name}/artists")]
pub async fn handle_get_artists(user_name: web::Path<String>) -> impl Responder {
    let user_name = user_name.into_inner();
    match get_top_artists(&user_name).await {
        Ok(artists) => HttpResponse::Ok().json(artists),
        Err(e) => {
            tracing::error!(error = %e, "Error getting top artists");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[get("/1/stats/user/{user_name}/releases")]
pub async fn handle_get_releases(user_name: web::Path<String>) -> impl Responder {
    let user_name = user_name.into_inner();
    match get_top_releases(&user_name).await {
        Ok(releases) => HttpResponse::Ok().json(releases),
        Err(e) => {
            tracing::error!(error = %e, "Error getting top releases");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[get("/1/stats/user/{user_name}/recordings")]
pub async fn handle_get_recordings(user_name: web::Path<String>) -> impl Responder {
    let user_name = user_name.into_inner();
    match get_top_recordings(&user_name).await {
        Ok(recordings) => HttpResponse::Ok().json(recordings),
        Err(e) => {
            tracing::error!(error = %e, "Error getting top recordings");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[get("/1/stats/user/{user_name}/release-groups")]
pub async fn handle_get_release_groups(user_name: web::Path<String>) -> impl Responder {
    let user_name = user_name.into_inner();
    match get_top_release_groups(&user_name).await {
        Ok(release_groups) => HttpResponse::Ok().json(release_groups),
        Err(e) => {
            tracing::error!(error = %e, "Error getting top release groups");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[get("/1/stats/user/{user_name}/recordings")]
pub async fn handle_get_recording_activity(user_name: web::Path<String>) -> impl Responder {
    let user_name = user_name.into_inner();
    match get_top_recordings(&user_name).await {
        Ok(recordings) => HttpResponse::Ok().json(recordings),
        Err(e) => {
            tracing::error!(error = %e, "Error getting top recordings");
            HttpResponse::InternalServerError().finish()
        }
    }
}
