use anyhow::Error;
use reqwest::Client;

use crate::{cache::Cache, get_artist, token::generate_token, types::{album_tracks::AlbumTracks, currently_playing::{Album, CurrentlyPlaying}}};

const ROCKSKY_API: &str = "https://api.rocksky.app";

pub async fn scrobble(cache: Cache, spotify_email: &str,  did: &str, refresh_token: &str) -> Result<(), Error> {
  let cached = cache.get(spotify_email)?;
  if cached.is_none() {
    println!("No currently playing song is cached for {}, skipping", spotify_email);
    return Ok(());
  }

  let track = serde_json::from_str::<CurrentlyPlaying>(&cached.unwrap())?;
  let artist = get_artist(cache.clone(), &track.item.artists.first().unwrap().id, &refresh_token).await?;

  let token = generate_token(did)?;
  let client = Client::new();
  let response = client
    .post(&format!("{}/now-playing", ROCKSKY_API))
    .bearer_auth(token)
    .json(&serde_json::json!({
      "title": track.item.name,
      "album": track.item.album.name,
      "artist": track.item.artists.iter().map(|artist| artist.name.clone()).collect::<Vec<String>>().join(", "),
      "albumArtist": track.item.album.artists.first().map(|artist| artist.name.clone()),
      "duration": track.item.duration_ms,
      "trackNumber": track.item.track_number,
      "releaseDate": track.item.album.release_date,
      "year": track.item.album.release_date.split('-').next().unwrap().parse::<u32>().unwrap(),
      "discNumber": track.item.disc_number,
      "albumArt": track.item.album.images.first().map(|image| image.url.clone()),
      "spotifyLink": track.item.external_urls.spotify,
      "label": track.item.album.label,
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

pub async fn update_library(cache: Cache, spotify_email: &str, did: &str) -> Result<(), Error> {
  let cached = cache.get(spotify_email)?;
  if cached.is_none() {
    println!("No currently playing song is cached for {}, skipping", spotify_email);
    return Ok(());
  }

  let track = serde_json::from_str::<CurrentlyPlaying>(&cached.unwrap())?;
  let cached = cache.get(&format!("{}:tracks", track.item.album.id))?;
  if cached.is_none() {
    println!("Album not cached {}, skipping", track.item.album.id);
    return Ok(());
  }

  let tracks = serde_json::from_str::<AlbumTracks>(&cached.unwrap())?;

  let cached = cache.get(&track.item.album.id)?;
  let album = serde_json::from_str::<Album>(&cached.unwrap())?;

  let token = generate_token(did)?;

  for track in tracks.items {
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
        "releaseDate": album.release_date,
        "year": album.release_date.split('-').next().unwrap().parse::<u32>().unwrap(),
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

    if !response.status().is_success() {
      println!("Failed to save track: {}", response.text().await?);
    }
  }

  Ok(())
}
