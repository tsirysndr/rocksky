use std::env;

use owo_colors::OwoColorize;
use rand::Rng;
use sqlx::{Pool, Postgres};
use anyhow::Error;
use crate::cache::Cache;
use crate::crypto::decrypt_aes_256_ctr;
use crate::musicbrainz::client::MusicbrainzClient;
use crate::spotify::client::SpotifyClient;
use crate::spotify::refresh_token;
use crate::{repo, rocksky};
use crate::types::{ScrobbleRequest, Track};

pub async fn scrobble(pool: &Pool<Postgres>, cache: &Cache, scrobble: ScrobbleRequest, did: &str) -> Result<(), Error> {
  let spofity_tokens = repo::spotify_token::get_spotify_tokens(pool, 100).await?;

  if spofity_tokens.is_empty() {
      return Err(Error::msg("No Spotify tokens found"));
  }

  let mb_client = MusicbrainzClient::new();

  let key = format!("{} - {}", scrobble.data.song.parsed.artist.to_lowercase(), scrobble.data.song.parsed.track.to_lowercase());

   let cached = cache.get(&key)?;
        if cached.is_some() {
            println!("{}", format!("Cached: {}", key).yellow());
            let track = serde_json::from_str::<Track>(&cached.unwrap())?;
            rocksky::scrobble(cache, &did, track, scrobble.time).await?;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            return Ok(());
        }

        let result = repo::track::get_track(pool, &scrobble.data.song.parsed.track, &scrobble.data.song.parsed.artist).await?;

        if let Some(track) = result {
            println!("{}", "Xata (track)".yellow());
            let album = repo::album::get_album_by_track_id(pool, &track.xata_id).await?;
            let artist = repo::artist::get_artist_by_track_id(pool, &track.xata_id).await?;
            let mut track: Track = track.into();
            track.year = match album.year {
                Some(year) => Some(year as u32),
                None => match album.release_date.clone() {
                    Some(release_date) => {
                        let year = release_date.split("-").next();
                        year.and_then(|x| x.parse::<u32>().ok())
                    }
                    None => None,
                },
            };
            track.release_date = album.release_date.map(|x| x.split("T").next().unwrap().to_string());
            track.artist_picture = artist.picture.clone();

            rocksky::scrobble(cache, &did, track, scrobble.time).await?;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            return Ok(());
        }

        // we need to pick a random token to avoid Spotify rate limiting
        // and to avoid using the same token for all scrobbles
        // this is a simple way to do it, but we can improve it later
        // by using a more sophisticated algorithm
        // or by using a token pool
        let mut rng = rand::rng();
        let random_index = rng.random_range(0..spofity_tokens.len());
        let spotify_token = &spofity_tokens[random_index];

        let spotify_token = decrypt_aes_256_ctr(
            &spotify_token.refresh_token,
        &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?
        )?;

        let spotify_token = refresh_token(&spotify_token).await?;
        let spotify_client = SpotifyClient::new(&spotify_token.access_token);

        let query = match scrobble.data.song.parsed.artist.contains(" x ") {
            true => {
                let artists = scrobble
                    .data
                    .song
                    .parsed
                    .artist
                    .split(" x ")
                    .map(|a| format!(r#"artist:"{}""#, a))
                    .collect::<Vec<_>>()
                    .join(" AND ");
                format!(r#"track:"{}" AND ({})"#, scrobble.data.song.parsed.track, artists)
            },
            false => format!(r#"track:"{}" artist:"{}""#, scrobble.data.song.parsed.track, scrobble.data.song.parsed.artist),
        };
        let result = spotify_client.search(&query).await?;

        if let Some(track) = result.tracks.items.first() {
            println!("{}", "Spotify (track)".yellow());
            let mut track = track.clone();

            if  let Some(album) = spotify_client.get_album(&track.album.id).await? {
                track.album = album;
            }

            if let Some(artist) = spotify_client.get_artist(&track.album.artists[0].id).await? {
                track.album.artists[0] = artist;
            }

            rocksky::scrobble(cache, &did, track.into(), scrobble.time).await?;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            return Ok(());
        }

        let query = format!(
            r#"recording:"{}" AND artist:"{}""#,
            scrobble.data.song.parsed.track, scrobble.data.song.parsed.artist
        );
        let result = mb_client.search(&query).await?;

        if let Some(recording) = result.recordings.first() {
            let result = mb_client.get_recording(&recording.id).await?;
            println!("{}", "Musicbrainz (recording)".yellow());
            rocksky::scrobble(cache,  &did, result.into(), scrobble.time).await?;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            return Ok(());
        }

        println!("{} {} - {}, skipping", "Track not found: ".yellow(), scrobble.data.song.parsed.artist, scrobble.data.song.parsed.track);

  Ok(())
}