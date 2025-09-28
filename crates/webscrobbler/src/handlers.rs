use crate::{
    cache::Cache, consts::BANNER, musicbrainz::client::MusicbrainzClient, repo,
    scrobbler::scrobble, types::ScrobbleRequest,
};
use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use owo_colors::OwoColorize;
use sqlx::{Pool, Postgres};
use std::sync::Arc;
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

#[get("/")]
pub async fn index() -> impl Responder {
    HttpResponse::Ok().body(BANNER)
}

#[post("/{id}")]
async fn handle_scrobble(
    data: web::Data<Arc<Pool<Postgres>>>,
    cache: web::Data<Cache>,
    mb_client: web::Data<Arc<MusicbrainzClient>>,
    mut payload: web::Payload,
    req: HttpRequest,
) -> Result<impl Responder, actix_web::Error> {
    let id = req.match_info().get("id").unwrap();
    tracing::info!(id = %id.bright_green(), "Received scrobble");

    let pool = data.get_ref().clone();

    let user = repo::user::get_user_by_webscrobbler(&pool, id)
        .await
        .map_err(|err| {
            actix_web::error::ErrorInternalServerError(format!("Database error: {}", err))
        })?;

    if user.is_none() {
        return Ok(HttpResponse::NotFound().body("There is no user with this webscrobbler ID"));
    }
    let user = user.unwrap();

    let body = read_payload!(payload);
    let params = serde_json::from_slice::<ScrobbleRequest>(&body).map_err(|err| {
        let body = String::from_utf8_lossy(&body);
        tracing::error!(body = %body, error = %err, "Failed to parse JSON");
        actix_web::error::ErrorBadRequest(format!("Failed to parse JSON: {}", err))
    })?;

    tracing::info!(params = ?params, "Parsed scrobble request");

    if params.event_name != "scrobble" {
        tracing::info!(event_name = %params.event_name.cyan(), "Skipping non-scrobble event");
        return Ok(HttpResponse::Ok().body("Skipping non-scrobble event"));
    }

    // Check if connector is Spotify
    if params.data.song.connector.id == "spotify" {
        // Skip if the user has a Spotify token
        let spotify_token = repo::spotify_token::get_spotify_token(&pool, &user.did)
            .await
            .map_err(|err| {
                actix_web::error::ErrorInternalServerError(format!(
                    "Failed to get Spotify tokens: {}",
                    err
                ))
            })?;

        if spotify_token.is_some() {
            tracing::info!("User has a Spotify token, skipping scrobble");
            return Ok(HttpResponse::Ok().body("User has a Spotify token, skipping scrobble"));
        }
    }

    let cache = cache.get_ref().clone();

    if params.data.song.connector.id == "emby" {
        let artist = params.data.song.parsed.artist.clone();
        let track = params.data.song.parsed.track.clone();
        let cached = cache.get(&format!(
            "listenbrainz:emby:{}:{}:{}",
            artist, track, user.did
        ));

        if cached.is_err() {
            tracing::error!(artist = %artist, track = %track, error = %cached.unwrap_err(), "Failed to check cache for Emby scrobble");
            return Ok(HttpResponse::Ok().body("Failed to check cache for Emby scrobble"));
        }

        if cached.unwrap().is_some() {
            tracing::warn!(artist = %artist, track = %track, "Skipping duplicate scrobble for Emby");
            return Ok(HttpResponse::Ok().body("Skipping duplicate scrobble for Emby"));
        }
    }

    let mb_client = mb_client.get_ref().as_ref();
    scrobble(&pool, &cache, mb_client, params, &user.did)
        .await
        .map_err(|err| {
            actix_web::error::ErrorInternalServerError(format!("Failed to scrobble: {}", err))
        })?;

    Ok(HttpResponse::Ok().body("Scrobble received"))
}
