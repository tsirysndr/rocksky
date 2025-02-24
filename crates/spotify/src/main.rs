use std::{env, thread};

use cache::Cache;
use crypto::decrypt_aes_256_ctr;
use dotenv::dotenv;
use reqwest::Client;
use anyhow::Error;
use rocksky::{scrobble, update_library};
use sqlx::{postgres::PgPoolOptions, Pool, Postgres};
use types::{album_tracks::AlbumTracks, currently_playing::{Album, Artist, CurrentlyPlaying}, spotify_token::SpotifyTokenWithEmail, token::AccessToken};
use owo_colors::OwoColorize;

pub mod types;
pub mod cache;
pub mod crypto;
pub mod rocksky;
pub mod token;

const BASE_URL: &str = "https://api.spotify.com/v1";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  dotenv().ok();
  let pool=  PgPoolOptions::new().max_connections(5).connect(&env::var("XATA_POSTGRES_URL")?).await?;

  let users = find_spotify_users(&pool, 0, 100).await?;

  for user in users {
    let email = user.0.clone();
    let token = user.1.clone();
    let did = user.2.clone();
    thread::spawn(move || {
      let rt = tokio::runtime::Runtime::new().unwrap();
      rt.block_on(async {
        watch_currently_playing(email, token, did).await?;
        Ok::<(), Error>(())
      }).unwrap();
    });
  }

  // wait for all threads to finish
  loop {
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
  }
}

pub async fn refresh_token(token: &str) -> Result<AccessToken, Error> {
  if env::var("SPOTIFY_CLIENT_ID").is_err() || env::var("SPOTIFY_CLIENT_SECRET").is_err() {
    panic!("Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables");
  }

  let client_id = env::var("SPOTIFY_CLIENT_ID")?;
  let client_secret = env::var("SPOTIFY_CLIENT_SECRET")?;

  let client = Client::new();

  let response = client.post("https://accounts.spotify.com/api/token")
    .basic_auth(&client_id, Some(client_secret))
    .form(&[
      ("grant_type", "refresh_token"),
      ("refresh_token", token),
      ("client_id", &client_id)
      ])
    .send()
    .await?;
  let token = response.json::<AccessToken>().await?;
  Ok(token)
}

pub async fn get_currently_playing(cache: Cache, user_id: &str, token: &str) -> Result<Option<(CurrentlyPlaying, bool)>, Error> {
  if let Ok(Some(data)) = cache.get(user_id) {
    let data: CurrentlyPlaying = serde_json::from_str(&data)?;
    // detect if the song has changed
    let previous = cache.get(&format!("{}:previous", user_id))?;
    let changed = match previous {
      Some(previous) => {
        let previous: CurrentlyPlaying = serde_json::from_str(&previous)?;
        previous.item.id != data.item.id && previous.progress_ms.unwrap_or(0) != data.progress_ms.unwrap_or(0)
      },
      _ => true
    };
    return Ok(Some((data, changed)));
  }


  let token = refresh_token(token).await?;
  let client = Client::new();
  let response = client.get(format!("{}/me/player/currently-playing", BASE_URL))
    .bearer_auth(token.access_token)
    .send()
    .await?;


  // check if status code is 204
  if response.status().as_u16() == 204 {
    println!("No content");
    return Ok(None);
  }

  let data = response.json::<CurrentlyPlaying>().await?;

  cache.setex(user_id, &serde_json::to_string(&data)?, 15)?;
  // detect if the song has changed
  let previous = cache.get(&format!("{}:previous", user_id))?;
  let changed = match previous {
    Some(previous) => {
      let previous: CurrentlyPlaying = serde_json::from_str(&previous)?;
      previous.item.id != data.item.id && previous.progress_ms.unwrap_or(0) != data.progress_ms.unwrap_or(0)
    },
    _ => false
  };

  // save as previous song
  cache.setex(&format!("{}:previous", user_id), &serde_json::to_string(&data)?, 20)?;

  Ok(Some((data, changed)))
}

pub async fn get_artist(cache: Cache, artist_id: &str, token: &str) -> Result<Option<Artist>, Error> {
  if let Ok(Some(data)) = cache.get(artist_id) {
    return Ok(Some(serde_json::from_str(&data)?));
  }

  let token = refresh_token(token).await?;
  let client = Client::new();
  let response = client.get(&format!("{}/artists/{}", BASE_URL, artist_id))
    .bearer_auth(token.access_token)
    .send()
    .await?;


  let headers = response.headers().clone();
  let data = response.text().await?;

  if data == "Too many requests" {
    println!("> retry-after {}", headers.get("retry-after").unwrap().to_str().unwrap());
    println!("> {} [get_artist]", data);
    return Ok(None);
  }

  cache.setex(artist_id, &data, 20)?;

  Ok(Some(serde_json::from_str(&data)?))
}

pub async fn get_album(cache: Cache, album_id: &str, token: &str) -> Result<Option<Album>, Error> {
  if let Ok(Some(data)) = cache.get(album_id) {
    return Ok(Some(serde_json::from_str(&data)?));
  }

  let token = refresh_token(token).await?;
  let client = Client::new();
  let response = client.get(&format!("{}/albums/{}", BASE_URL, album_id))
    .bearer_auth(token.access_token)
    .send()
    .await?;

    let headers = response.headers().clone();
    let data = response.text().await?;

    if data == "Too many requests" {
      println!("> retry-after {}", headers.get("retry-after").unwrap().to_str().unwrap());
      println!("> {} [get_album]", data);
      return Ok(None);
    }

  cache.setex(album_id, &data, 20)?;

  Ok(Some(serde_json::from_str(&data)?))
}

pub async fn get_album_tracks(cache: Cache, album_id: &str, token: &str) -> Result<AlbumTracks, Error> {
  if let Ok(Some(data)) = cache.get(&format!("{}:tracks", album_id)) {
      return Ok(serde_json::from_str(&data)?);
  }

  let token = refresh_token(token).await?;
  let client = Client::new();
  let mut all_tracks = Vec::new();
  let mut offset = 0;
  let limit = 50;


  loop {
      let response = client.get(&format!("{}/albums/{}/tracks", BASE_URL, album_id))
          .bearer_auth(&token.access_token)
          .query(&[("limit", &limit.to_string()), ("offset", &offset.to_string())])
          .send()
          .await?;

      let headers = response.headers().clone();
      let data = response.text().await?;
      if data == "Too many requests" {
        println!("> retry-after {}", headers.get("retry-after").unwrap().to_str().unwrap());
        println!("> {} [get_album_tracks]", data);
        continue;
      }

      let album_tracks: AlbumTracks = serde_json::from_str(&data)?;

      if album_tracks.items.is_empty() {
          break;
      }

      all_tracks.extend(album_tracks.items);
      offset += limit;
  }

  let all_tracks_json = serde_json::to_string(&all_tracks)?;
  cache.setex(&format!("{}:tracks", album_id), &all_tracks_json, 20)?;

  Ok(AlbumTracks {
    items: all_tracks,
    ..Default::default()
  })
}

pub async fn find_spotify_users(
  pool: &Pool<Postgres>,
  offset: usize,
  limit: usize
) -> Result<Vec<(String, String, String)>, Error> {
  let results: Vec<SpotifyTokenWithEmail> = sqlx::query_as(r#"
    SELECT * FROM spotify_tokens
    LEFT JOIN spotify_accounts ON spotify_tokens.user_id = spotify_accounts.user_id
    LEFT JOIN users ON spotify_accounts.user_id = users.xata_id
    LIMIT $1 OFFSET $2
  "#)
    .bind(limit as i64)
    .bind(offset as i64)
    .fetch_all(pool)
    .await?;

  let mut user_tokens = vec![];

  for result in &results {
    let token = decrypt_aes_256_ctr(
      &result.refresh_token,
      &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
    )?;
    user_tokens.push((result.email.clone(), token, result.did.clone()));
  }

  Ok(user_tokens)
}

pub async fn watch_currently_playing(spotify_email: String, token: String, did: String) -> Result<(), Error> {
  let cache = Cache::new()?;
  loop {
    let spotify_email = spotify_email.clone();
    let token = token.clone();
    let did = did.clone();
    let cache = cache.clone();

    thread::spawn(move || {
      let rt = tokio::runtime::Runtime::new().unwrap();
      rt.block_on(async {
        let currently_playing = get_currently_playing(
          cache.clone(),
          &spotify_email,
          &token
        ).await?;

        if let Some((data, changed)) = currently_playing {
          println!("{} {} is_playing: {} changed: {}", format!("[{}]", spotify_email).bright_green(), format!("{} - {}", data.item.name, data.item.artists[0].name).cyan(), data.is_playing, changed);

          if changed {
            scrobble(
              cache.clone(),
              &spotify_email,
              &did,
              &token
            ).await?;
            get_album(cache.clone(), &data.item.album.id, &token).await?;
            get_album_tracks(cache.clone(), &data.item.album.id, &token).await?;
            update_library(cache.clone(), &spotify_email, &did).await?;
          }
        }

        Ok::<(), Error>(())
      })?;

      Ok::<(), Error>(())
    });
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    ()
  }
}
