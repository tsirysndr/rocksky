use std::sync::Arc;
use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use owo_colors::OwoColorize;
use sqlx::{Pool, Postgres};
use crate::{cache::Cache, repo, scrobbler::scrobble, types::ScrobbleRequest, BANNER};
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
  mut payload: web::Payload,
  req: HttpRequest,
) -> Result<impl Responder, actix_web::Error> {
  let id = req.match_info().get("id").unwrap();
  println!("Received scrobble for ID: {}", id.cyan());

  let pool = data.get_ref().clone();

  let user = repo::user::get_user_by_webscrobbler(&pool, id).await
    .map_err(|err| actix_web::error::ErrorInternalServerError(format!("Database error: {}", err)))?;

  if user.is_none() {
    return Ok(HttpResponse::NotFound().body("There is no user with this webscrobbler ID"));
  }
  let user = user.unwrap();

  let body = read_payload!(payload);
  let params = serde_json::from_slice::<ScrobbleRequest>(&body)
    .map_err(|err| actix_web::error::ErrorBadRequest(format!("Failed to parse JSON: {}", err)))?;

  println!("Parsed scrobble request: {:#?}", params);

  if params.event_name != "scrobble" {
    println!("Skipping non-scrobble event: {}", params.event_name.green());
    return Ok(HttpResponse::BadRequest().body("Skipping non-scrobble event"));
  }

  // Check if connector is Spotify
  if params.data.song.connector.id == "spotify" {
    // Skip if the user has a Spotify token
    let spotify_tokens = repo::spotify_token::get_spotify_token(&pool, &user.did).await
      .map_err(|err| actix_web::error::ErrorInternalServerError(format!("Failed to get Spotify tokens: {}", err)))?;

    if spotify_tokens.is_some() {
      println!("User has a Spotify token, skipping scrobble");
      return Ok(HttpResponse::Ok().body("User has a Spotify token, skipping scrobble"));
    }
  }


  let cache = cache.get_ref().clone();

  scrobble(&pool, &cache, params, &user.xata_id).await
    .map_err(|err| actix_web::error::ErrorInternalServerError(format!("Failed to scrobble: {}", err)))?;


  Ok(HttpResponse::Ok().body("Scrobble received"))
}
