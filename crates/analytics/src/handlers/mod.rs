use std::sync::{Arc, Mutex};

use actix_web::{web, HttpRequest, HttpResponse};
use albums::{get_albums, get_top_albums};
use artists::{get_artists, get_top_artists};
use duckdb::Connection;
use scrobbles::get_scrobbles;
use stats::{get_scrobbles_per_day, get_scrobbles_per_month, get_scrobbles_per_year, get_stats};
use tracks::{get_loved_tracks, get_top_tracks, get_tracks};
use anyhow::Error;

pub mod albums;
pub mod artists;
pub mod scrobbles;
pub mod tracks;
pub mod stats;


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


pub async fn handle(method: &str, payload: &mut web::Payload, req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
  match method {
    "library.getAlbums" => get_albums(payload, req, conn.clone()).await,
    "library.getArtists" => get_artists(payload, req, conn.clone()).await,
    "library.getTracks" => get_tracks(payload, req, conn.clone()).await,
    "library.getScrobbles" => get_scrobbles(payload, req, conn.clone()).await,
    "library.getLovedTracks" => get_loved_tracks(payload, req, conn.clone()).await,
    "library.getStats" => get_stats(payload, req, conn.clone()).await,
    "library.getTopAlbums" => get_top_albums(payload, req, conn.clone()).await,
    "library.getTopArtists" => get_top_artists(payload, req, conn.clone()).await,
    "library.getTopTracks" => get_top_tracks(payload, req, conn.clone()).await,
    "library.getScrobblesPerDay" => get_scrobbles_per_day(payload, req, conn.clone()).await,
    "library.getScrobblesPerMonth" => get_scrobbles_per_month(payload, req, conn.clone()).await,
    "library.getScrobblesPerYear" => get_scrobbles_per_year(payload, req, conn.clone()).await,
    _ => return Err(anyhow::anyhow!("Method not found")),
  }
}
