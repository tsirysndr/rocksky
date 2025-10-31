use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::{clients::spotify::SpotifyClient, repo, types::track::Track};

pub async fn search_track(
    pool: &Pool<Postgres>,
    title: &str,
    artist: &str,
) -> Result<Option<(Track, Option<String>)>, Error> {
    let artist = &artist.replace(", and ", ", ");
    let xata_track = repo::track::get_track(pool, title, artist).await?;

    if let Some(ref track) = xata_track
        && track.spotify_id.is_some()
    {
        tracing::info!("Found track in Rocksky Database");
        tracing::info!(
            id = %track.xata_id,
            artist = %track.artist,
            album = %track.album,
            album_atist = %track.album_artist,
            album_uri = ?track.album_uri,
            artist_uri = ?track.artist_uri,
            "Xata (track)"
        );

        return Ok(Some((track.clone().into(), Some(track.xata_id.clone()))));
    }

    let mut spotify = SpotifyClient::new_with_token(pool).await?;
    spotify.get_access_token().await?;
    // build query
    let artists = artist
        .split(", ")
        .map(|a| format!("artist:\"{}\"", a))
        .collect::<Vec<_>>()
        .join(" ");

    let results = spotify
        .search_track(&format!(r#"track:"{}" {}"#, title, artists))
        .await?;

    if results.tracks.items.len() == 0 {
        return Ok(None);
    }

    let track = &results.tracks.items[0];

    let artists = track
        .artists
        .iter()
        .map(|a| a.name.to_lowercase().clone())
        .collect::<Vec<_>>();

    // check if artists don't contain the scrobble artist (to avoid wrong matches)
    if !artists.contains(
        &artist
            .to_lowercase()
            .split(", ")
            .next()
            .unwrap()
            .to_string(),
    ) {
        tracing::warn!(artist = %artist, track = ?track, "Artist mismatch, skipping");
        return Ok(None);
    }
    tracing::info!("Spotify (track)");
    tracing::info!(id = %track.id, artist = %track.artists[0].name, album = %track.album.name, title = %track.name, "Fetched track from Spotify");

    let mut track = track.clone();

    if let Some(album) = spotify.get_album(&track.album.id).await? {
        track.album = album;
    }

    if let Some(artist) = spotify.get_artist(&track.album.artists[0].id).await? {
        track.album.artists[0] = artist;
    }

    match xata_track {
        Some(xata_track) => Ok(Some((track.into(), Some(xata_track.xata_id.clone())))),
        None => Ok(Some((track.into(), None))),
    }
}
