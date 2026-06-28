use anyhow::Error;
use reqwest::Client;
use sqlx::{Pool, Postgres};

use crate::{
    cache::Cache,
    get_artist, get_currently_playing,
    token::generate_token,
    types::{
        album_tracks::Track,
        currently_playing::{Album, CurrentlyPlaying},
    },
};

const ROCKSKY_API: &str = "https://api.rocksky.app";

pub async fn scrobble(
    cache: Cache,
    spotify_email: &str,
    did: &str,
    refresh_token: &str,
    client_id: &str,
    client_secret: &str,
    pool: &Pool<Postgres>,
) -> Result<(), Error> {
    let cached = cache.get(spotify_email).await?;
    if cached.is_none() {
        tracing::debug!(
            email = %spotify_email,
            "no currently playing song is cached, skipping"
        );
        return Ok(());
    }

    let track = serde_json::from_str::<CurrentlyPlaying>(&cached.unwrap())?;
    if track.item.is_none() {
        tracing::debug!(email = %spotify_email, "no currently playing song found, skipping");
        return Ok(());
    }

    let track_item = track.item.unwrap();

    let artist = get_artist(
        cache.clone(),
        &track_item.artists.first().unwrap().id,
        &refresh_token,
        &client_id,
        &client_secret,
        pool,
        spotify_email,
    )
    .await?;

    let token = generate_token(did)?;
    let client = Client::new();
    let response = client
    .post(&format!("{}/now-playing", ROCKSKY_API))
    .bearer_auth(token)
    .json(&serde_json::json!({
      "title": track_item.name,
      "album": track_item.album.name,
      "artist": track_item.artists.iter().map(|artist| artist.name.clone()).collect::<Vec<String>>().join(", "),
      "albumArtist": track_item.album.artists.first().map(|artist| artist.name.clone()),
      "duration": track_item.duration_ms,
      "trackNumber": track_item.track_number,
      "releaseDate": match track_item.album.release_date_precision.as_str() {
        "day" => Some(track_item.album.release_date.clone()),
        _ => None
      },
      "year":  match track_item.album.release_date_precision.as_str() {
        "day" => Some(track_item.album.release_date.split('-').next().unwrap().parse::<u32>().unwrap()),
        "year" => Some(track_item.album.release_date.parse::<u32>().unwrap()),
        _ =>  None
      },
      "discNumber": track_item.disc_number,
      "albumArt": track_item.album.images.first().map(|image| image.url.clone()),
      "spotifyLink": match track_item.external_urls {
        Some(urls) => Some(urls.spotify),
        None => None,
      },
      "isrc": Some(track_item.external_ids.isrc.clone()).filter(|s| !s.is_empty()),
      "label": track_item.album.label,
      "artistPicture":  match &artist {
        Some(artist) => match &artist.images {
          Some(images) => Some(images.first().map(|image| image.url.clone())),
          None => None
        },
        None => None
      },
      "genres": match &artist {
        Some(artist) => artist.genres.clone(),
        None => None
      },
  }))
  .send()
  .await?;

    if !response.status().is_success() {
        let body = response.text().await?;
        tracing::error!(
            email = %spotify_email,
            body = %body,
            "failed to scrobble"
        );
    }

    Ok(())
}

pub async fn update_library(
    cache: Cache,
    spotify_email: &str,
    did: &str,
    refresh_token: &str,
    client_id: &str,
    client_secret: &str,
    pool: &Pool<Postgres>,
) -> Result<(), Error> {
    let cached = cache.get(spotify_email).await?;
    if cached.is_none() {
        tracing::debug!(
            email = %spotify_email,
            "no currently playing song is cached, refreshing"
        );
        get_currently_playing(
            cache.clone(),
            &spotify_email,
            &refresh_token,
            client_id,
            client_secret,
            pool,
        )
        .await?;
    }

    let cached = cache.get(spotify_email).await?;
    let track = serde_json::from_str::<CurrentlyPlaying>(&cached.unwrap())?;
    if track.item.is_none() {
        tracing::debug!(email = %spotify_email, "no currently playing song found, skipping");
        return Ok(());
    }
    let track_item = track.item.unwrap();
    let cached = cache
        .get(&format!("{}:tracks", track_item.album.id))
        .await?;
    if cached.is_none() {
        tracing::debug!(album_id = %track_item.album.id, "album not cached, skipping");
        return Ok(());
    }

    let tracks = serde_json::from_str::<Vec<Track>>(&cached.unwrap())?;

    let cached = cache.get(&track_item.album.id).await?;
    let album = serde_json::from_str::<Album>(&cached.unwrap())?;

    let token = generate_token(did)?;

    for track in tracks {
        let client = Client::new();
        let response = client
      .post(&format!("{}/tracks", ROCKSKY_API))
      .bearer_auth(&token)
      .json(&serde_json::json!({
        "title": track.name,
        "album": album.name,
        "artist": track.artists.iter().map(|artist| artist.name.clone()).collect::<Vec<String>>().join(", "),
        "albumArtist": album.artists.first().map(|artist| artist.name.clone()),
        "duration": track.duration_ms,
        "trackNumber": track.track_number,
        "releaseDate": match album.release_date_precision.as_str() {
          "day" => Some(album.release_date.clone()),
          _ => None
        },
        "year":  match album.release_date_precision.as_str() {
          "day" => Some(album.release_date.split('-').next().unwrap().parse::<u32>().unwrap()),
          "year" => Some(album.release_date.parse::<u32>().unwrap()),
          _ =>  None
        },
        "discNumber": track.disc_number,
        "albumArt": album.images.first().map(|image| image.url.clone()),
        "spotifyLink": match track.external_urls {
            Some(urls) => Some(urls.spotify),
            None => None,
        },
        "isrc": track.external_ids.as_ref().map(|e| e.isrc.clone()).filter(|s| !s.is_empty()),
        "label": album.label,
        "artistPicture": track.artists.first().map(|artist| match &artist.images {
          Some(images) => Some(images.first().map(|image| image.url.clone())),
          None => None
        }),
    }))
    .send()
    .await?;

        // wait 50 seconds to avoid rate limiting
        tokio::time::sleep(tokio::time::Duration::from_secs(50)).await;

        if !response.status().is_success() {
            let body = response.text().await?;
            tracing::error!(
                email = %spotify_email,
                track = %track.name,
                body = %body,
                "failed to save track"
            );
        }
    }

    Ok(())
}
