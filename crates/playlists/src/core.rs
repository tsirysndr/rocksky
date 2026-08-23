use std::{
    env,
    sync::{Arc, Mutex},
};

use anyhow::Error;
use duckdb::{params, Connection};
use owo_colors::OwoColorize;
use reqwest::Client;
use serde_json::json;
use sha2::Digest;
use sqlx::{Pool, Postgres};

use crate::{
    crypto::{decrypt_aes_256_ctr, generate_token},
    types::{self, spotify_token::SpotifyTokenWithEmail},
    xata::{self},
};

const ROCKSKY_API: &str = "https://api.rocksky.app";

pub fn create_tables(conn: Arc<Mutex<Connection>>) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    conn.execute_batch(
        r#"
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
  "#,
    )?;
    Ok(())
}

pub async fn load_users(conn: Arc<Mutex<Connection>>, pool: &Pool<Postgres>) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let users: Vec<xata::user::User> = sqlx::query_as(
        r#"
      SELECT * FROM users
  "#,
    )
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
    limit: usize,
) -> Result<Vec<(String, String, String, String, String, String)>, Error> {
    let results: Vec<SpotifyTokenWithEmail> = sqlx::query_as(
        r#"
    SELECT * FROM spotify_tokens
    LEFT JOIN spotify_accounts ON spotify_tokens.user_id = spotify_accounts.user_id
    LEFT JOIN users ON spotify_accounts.user_id = users.xata_id
    LEFT JOIN spotify_apps ON spotify_tokens.spotify_app_id = spotify_apps.spotify_app_id
    WHERE spotify_accounts.is_beta_user = true
    LIMIT $1 OFFSET $2
  "#,
    )
    .bind(limit as i64)
    .bind(offset as i64)
    .fetch_all(pool)
    .await?;

    let mut user_tokens = vec![];

    for result in &results {
        let token = decrypt_aes_256_ctr(
            &result.refresh_token,
            &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
        )?;
        let spotify_secret = decrypt_aes_256_ctr(
            &result.spotify_secret,
            &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
        )?;
        user_tokens.push((
            result.email.clone(),
            token,
            result.did.clone(),
            result.user_id.clone(),
            result.spotify_app_id.clone(),
            spotify_secret.clone(),
        ));
    }

    Ok(user_tokens)
}

/// Imports a user's Spotify playlists by handing them to the API to publish as
/// `app.rocksky.playlist` / `app.rocksky.playlist.song` records on the user's
/// PDS. Nothing here writes to Postgres: the rows appear only once jetstream
/// sees the resulting commits, which keeps the AT-Proto repo the single source
/// of truth for playlists.
pub async fn save_playlists(
    nc: Arc<Mutex<async_nats::Client>>,
    playlists: Vec<types::playlist::Playlist>,
    did: &str,
) -> Result<(), Error> {
    let token = generate_token(did)?;
    for playlist in playlists {
        println!(
            "Importing playlist: {} - {} tracks",
            playlist.name.bright_green(),
            playlist.tracks.total
        );

        let mut songs = vec![];
        let mut i = 1;
        for item in playlist.tracks.items.unwrap_or_default() {
            println!(
                "Saving track: {} - {}/{}",
                item.track.name.bright_green(),
                i,
                playlist.tracks.total
            );
            i += 1;

            let Some(track) = save_track(item.track, &token).await? else {
                println!("Failed to save track");
                continue;
            };

            // A playlist entry carries a strongRef to the song record, so a
            // track that was never published to a PDS has nothing to point at.
            let Some(uri) = track.uri.clone() else {
                println!(
                    "Skipping {}: no song record to reference yet",
                    track.title.yellow()
                );
                continue;
            };

            songs.push(json!({
              "uri": uri,
              "title": track.title,
              "artist": track.artist,
              "album": track.album,
              "albumArtist": track.album_artist,
              "duration": track.duration,
              "albumArtUrl": track.album_art,
            }));
        }

        let nc = nc.lock().unwrap();
        nc.publish(
            "rocksky.playlist.import",
            serde_json::to_string(&json!({
              "did": did,
              "name": playlist.name,
              "description": playlist.description,
              "pictureUrl": playlist.images.first().map(|i| i.url.clone()),
              "spotifyLink": playlist.external_urls.spotify,
              "songs": songs,
            }))
            .unwrap()
            .into(),
        )
        .await?;
        drop(nc);
    }
    Ok(())
}

pub async fn save_track(
    track: types::playlist::Track,
    token: &str,
) -> Result<Option<xata::track::Track>, Error> {
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
    let sha256 = format!(
        "{:x}",
        sha2::Sha256::digest(
            format!(
                "{} - {} - {}",
                track.name,
                track
                    .artists
                    .iter()
                    .map(|artist| artist.name.clone())
                    .collect::<Vec<String>>()
                    .join(", "),
                track.album.name
            )
            .to_lowercase()
            .as_bytes()
        )
    );
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
