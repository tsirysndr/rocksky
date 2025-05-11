use anyhow::Error;
use reqwest::Client;

use crate::{cache::Cache, get_artist, get_currently_playing, token::generate_token, types::{album_tracks::Track, currently_playing::{Album, CurrentlyPlaying}}};

const ROCKSKY_API: &str = "https://api.rocksky.app";

pub async fn scrobble(cache: Cache, spotify_email: &str,  did: &str, refresh_token: &str) -> Result<(), Error> {
  let cached = cache.get(spotify_email)?;
  if cached.is_none() {
    println!("No currently playing song is cached for {}, skipping", spotify_email);
    return Ok(());
  }

  let track = serde_json::from_str::<CurrentlyPlaying>(&cached.unwrap())?;
  if track.item.is_none() {
    println!("No currently playing song found, skipping");
    return Ok(());
  }

  let track_item = track.item.unwrap();

  let artist = get_artist(cache.clone(), &track_item.artists.first().unwrap().id, &refresh_token).await?;

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
      "spotifyLink": track_item.external_urls.spotify,
      "label": track_item.album.label,
      "artistPicture":  match artist {
        Some(artist) => match artist.images {
          Some(images) => Some(images.first().map(|image| image.url.clone())),
          None => None
        },
        None => None
      },
  }))
  .send()
  .await?;


  if !response.status().is_success() {
    println!("Failed to scrobble: {}", response.text().await?);
  }

  Ok(())
}

pub async fn update_library(cache: Cache, spotify_email: &str, did: &str, refresh_token: &str) -> Result<(), Error> {
  let cached = cache.get(spotify_email)?;
  if cached.is_none() {
    println!("No currently playing song is cached for {}, refreshing", spotify_email);
    get_currently_playing(
      cache.clone(),
      &spotify_email,
      &refresh_token,
    ).await?;
  }

  let cached = cache.get(spotify_email)?;
  let track = serde_json::from_str::<CurrentlyPlaying>(&cached.unwrap())?;
  if track.item.is_none() {
    println!("No currently playing song found, skipping");
    return Ok(());
  }
  let track_item = track.item.unwrap();
  let cached = cache.get(&format!("{}:tracks", track_item.album.id))?;
  if cached.is_none() {
    println!("Album not cached {}, skipping", track_item.album.id);
    return Ok(());
  }

  let tracks = serde_json::from_str::<Vec<Track>>(&cached.unwrap())?;

  let cached = cache.get(&track_item.album.id)?;
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
        "spotifyLink": track.external_urls.spotify,
        "label": album.label,
        "artistPicture": track.artists.first().map(|artist| match &artist.images {
          Some(images) => Some(images.first().map(|image| image.url.clone())),
          None => None
        }),
    }))
    .send()
    .await?;

    // wait 30 seconds to avoid rate limiting
    tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;

    if !response.status().is_success() {
      println!("Failed to save track: {}", response.text().await?);
    }
  }

  Ok(())
}
