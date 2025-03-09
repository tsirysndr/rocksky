use std::{env, sync::{Arc, Mutex}};

use anyhow::Error;
use duckdb::{params, Connection};
use owo_colors::OwoColorize;
use reqwest::Client;
use serde_json::json;
use sha2::Digest;
use sqlx::{Pool, Postgres};

use crate::{crypto::{decrypt_aes_256_ctr, generate_token}, types::{self, spotify_token::SpotifyTokenWithEmail}, xata::{self, track::Track}};

const ROCKSKY_API: &str = "https://api.rocksky.app";

pub fn create_tables(conn: Arc<Mutex<Connection>>) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    conn.execute_batch(r#"
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      picture TEXT,
      spotify_link TEXT,
      tidal_link TEXT,
      apple_music_link TEXT,
      xata_createdat TIMESTAMP,
      xata_updatedat TIMESTAMP,
      uri TEXT,
      created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS tracks (
        id VARCHAR PRIMARY KEY,
        title VARCHAR,
        artist VARCHAR,
        album_artist VARCHAR,
        album_art VARCHAR,
        album VARCHAR,
        track_number INTEGER,
        duration INTEGER,
        mb_id VARCHAR,
        youtube_link VARCHAR,
        spotify_link VARCHAR,
        tidal_link VARCHAR,
        apple_music_link VARCHAR,
        sha256 VARCHAR NOT NULL,
        lyrics TEXT,
        composer VARCHAR,
        genre VARCHAR,
        disc_number INTEGER,
        copyright_message VARCHAR,
        label VARCHAR,
        uri VARCHAR,
        artist_uri VARCHAR,
        album_uri VARCHAR,
        created_at TIMESTAMP,
    );
     CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY,
        display_name VARCHAR,
        did VARCHAR,
        handle VARCHAR,
        avatar VARCHAR,
    );
     CREATE TABLE IF NOT EXISTS playlist_tracks (
        id VARCHAR PRIMARY KEY,
        playlist_id VARCHAR,
        track_id VARCHAR,
        added_by VARCHAR,
        created_at TIMESTAMP,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id),
        FOREIGN KEY (track_id) REFERENCES tracks(id),
    );
    CREATE TABLE IF NOT EXISTS user_playlists (
        id VARCHAR PRIMARY KEY,
        user_id VARCHAR,
        playlist_id VARCHAR,
        created_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id),
    );

    CREATE UNIQUE INDEX IF NOT EXISTS user_playlists_unique_index ON user_playlists (user_id, playlist_id);
  "#)?;
    Ok(())
}


pub async fn load_users(conn: Arc<Mutex<Connection>>, pool: &Pool<Postgres>) -> Result<(), Error> {
  let conn = conn.lock().unwrap();
  let users: Vec<xata::user::User> = sqlx::query_as(r#"
      SELECT * FROM users
  "#)
  .fetch_all(pool)
  .await?;

  for (i, user) in users.clone().into_iter().enumerate() {
      println!("user {} - {}", i, user.display_name.bright_green());
      match conn.execute(
          "INSERT INTO users (
              id,
              display_name,
              did,
              handle,
              avatar
          ) VALUES (?,
              ?,
              ?,
              ?,
              ?) ON CONFLICT DO NOTHING",
           params![
              user.xata_id,
              user.display_name,
              user.did,
              user.handle,
              user.avatar,
           ],
      ) {
          Ok(_) => (),
          Err(e) => println!("error: {}", e),
      }
  }

  println!("users: {:?}", users.len());
  Ok(())
}

pub async fn find_spotify_users(
  pool: &Pool<Postgres>,
  offset: usize,
  limit: usize
) -> Result<Vec<(String, String, String, String)>, Error> {
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
    user_tokens.push((result.email.clone(), token, result.did.clone(), result.user_id.clone()));
  }

  Ok(user_tokens)
}

pub async fn save_playlists(pool: &Pool<Postgres>, conn: Arc<Mutex<Connection>>, nc: Arc<Mutex<async_nats::Client>>, playlists: Vec<types::playlist::Playlist>, user_id: &str, did: &str) -> Result<(), Error> {
  let token = generate_token(did)?;
  for playlist in playlists {
    println!("Saving playlist: {} - {} tracks", playlist.name.bright_green(), playlist.tracks.total);

    sqlx::query(r#"
      INSERT INTO playlists (name, description, picture, spotify_link, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (spotify_link) DO UPDATE set
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      picture = EXCLUDED.picture,
      spotify_link = EXCLUDED.spotify_link,
      created_by = EXCLUDED.created_by
    "#)
      .bind(playlist.name)
      .bind(playlist.description)
      .bind(playlist.images.first().map(|i| i.url.clone()))
      .bind(&playlist.external_urls.spotify)
      .bind(user_id)
      .execute(pool)
      .await?;

    let new_playlist: Vec<xata::playlist::Playlist> = sqlx::query_as(r#"SELECT * FROM playlists WHERE spotify_link = $1"#)
      .bind(&playlist.external_urls.spotify)
      .fetch_all(pool)
      .await?;

    let new_playlist = new_playlist.first().unwrap();

    let nc = nc.lock().unwrap();
    nc.publish("rocksky.playlist",
     serde_json::to_string(&json!({
        "id": new_playlist.xata_id.clone(),
        "did": did,
      })
      ).unwrap().into()
    ).await?;
    drop(nc);

    let mut tracks_to_save: Vec<(String, String)> = vec![];
    let mut i = 1;
    for track in playlist.tracks.items.unwrap_or_default() {
      println!("Saving track: {} - {}/{}", track.track.name.bright_green(), i, playlist.tracks.total);
      i += 1;
      match save_track(track.track, &token).await? {
        Some(track) => {
          println!("Saved track: {}", track.xata_id.bright_green());
          tracks_to_save.push((new_playlist.xata_id.clone(), track.xata_id.clone()));
        },
        None => {
          println!("Failed to save track");
        }
      };
    }

    // delete all tracks from playlist
    sqlx::query(r#"
      DELETE FROM playlist_tracks WHERE playlist_id = $1
    "#)
      .bind(&new_playlist.xata_id)
      .execute(pool)
      .await?;

    // save tracks to playlist
    for (playlist_id, track_id) in tracks_to_save {
      sqlx::query(r#"
        INSERT INTO playlist_tracks (playlist_id, track_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      "#)
        .bind(&playlist_id)
        .bind(&track_id)
        .execute(pool)
        .await?;
    }

    sqlx::query(r#"
      INSERT INTO user_playlists (user_id, playlist_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, playlist_id) DO NOTHING
    "#)
      .bind(user_id)
      .bind(&new_playlist.xata_id)
      .execute(pool)
      .await?;

    let user_playlist: Vec<xata::user_playlist::UserPlaylist> = sqlx::query_as("SELECT * FROM user_playlists WHERE user_id = $1 AND playlist_id = $2")
      .bind(user_id)
      .bind(&new_playlist.xata_id)
      .fetch_all(pool)
      .await?;
    let user_playlist = user_playlist.first().unwrap();

    let conn = conn.lock().unwrap();
    conn.execute("INSERT INTO playlists (id, name, description, picture, spotify_link, uri, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
      params![
        &new_playlist.xata_id,
        &new_playlist.name,
        new_playlist.description,
        new_playlist.picture,
        new_playlist.spotify_link,
        new_playlist.uri,
        user_id
      ]
    )?;

    conn.execute(
      "INSERT INTO user_playlists (id, user_id, playlist_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      params![
        &user_playlist.xata_id,
        user_id,
        &new_playlist.xata_id,
        chrono::Utc::now()
      ]
    )?;

  }
  Ok(())
}


pub async fn save_track(track: types::playlist::Track, token: &str) -> Result<Option<xata::track::Track>, Error> {
  let client = Client::new();
    let response = client
      .post(&format!("{}/tracks", ROCKSKY_API))
      .bearer_auth(token)
      .json(&serde_json::json!({
        "title": track.name,
        "album": track.album.name,
        "artist": track.artists.iter().map(|artist| artist.name.clone()).collect::<Vec<String>>().join(", "),
        "albumArtist": track.album.artists.first().map(|artist| artist.name.clone()),
        "duration": track.duration_ms,
        "trackNumber": track.track_number,
        "releaseDate": match track.album.release_date_precision.as_str() {
          "day" => Some(track.album.release_date.clone()),
          _ => None
        },
        "year":  match track.album.release_date_precision.as_str() {
          "day" => Some(track.album.release_date.split('-').next().unwrap().parse::<u32>().unwrap()),
          "year" => Some(track.album.release_date.parse::<u32>().unwrap()),
          _ =>  None
        },
        "discNumber": track.disc_number,
        "albumArt": track.album.images.first().map(|image| image.url.clone()),
        "spotifyLink": track.external_urls.spotify,
    }))
    .send()
    .await?;

    if !response.status().is_success() {
      println!("Failed to save track: {}", response.text().await?);
      return Ok(None);
    }

    //  `${track.title} - ${track.artist} - ${track.album}`.toLowerCase()
    let sha256 = format!("{:x}", sha2::Sha256::digest(format!("{} - {} - {}", track.name, track.artists.iter().map(|artist| artist.name.clone()).collect::<Vec<String>>().join(", "), track.album.name).to_lowercase().as_bytes()));
    // get by sha256
    let response = client
      .get(&format!("{}/tracks/{}", ROCKSKY_API, sha256))
      .bearer_auth(token)
      .send()
      .await?;

    // wait 6 seconds to avoid rate limiting
    tokio::time::sleep(tokio::time::Duration::from_secs(6)).await;
    let status = response.status();
    let data = response.text().await?;

    if !status.is_success() {
      println!("Failed to get track: {}", data);
    }

  let track: xata::track::Track = serde_json::from_str(&data)?;

  Ok(Some(track))
}
