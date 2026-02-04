use std::env;

use crate::cache::Cache;
use crate::crypto::decrypt_aes_256_ctr;
use crate::musicbrainz::client::MusicbrainzClient;
use crate::musicbrainz::get_best_release_from_recordings;
use crate::musicbrainz::recording::Recording;
use crate::spotify::client::SpotifyClient;
use crate::spotify::refresh_token;
use crate::types::{ScrobbleRequest, Track};
use crate::{repo, rocksky};
use anyhow::Error;
use owo_colors::OwoColorize;
use rand::Rng;
use sqlx::{Pool, Postgres};

const MAX_SPOTIFY_RETRIES: u32 = 3;
const INITIAL_RETRY_DELAY_MS: u64 = 1000;

pub async fn scrobble(
    pool: &Pool<Postgres>,
    cache: &Cache,
    mb_client: &MusicbrainzClient,
    scrobble: ScrobbleRequest,
    did: &str,
) -> Result<(), Error> {
    let spofity_tokens = repo::spotify_token::get_spotify_tokens(pool, 100).await?;

    if spofity_tokens.is_empty() {
        return Err(Error::msg("No Spotify tokens found"));
    }

    let key = format!(
        "{} - {}",
        scrobble.data.song.parsed.artist.to_lowercase(),
        scrobble.data.song.parsed.track.to_lowercase()
    );

    let cached = cache.get(&key)?;
    if cached.is_some() {
        tracing::info!(artist = %scrobble.data.song.parsed.artist, track = %scrobble.data.song.parsed.track, "Using cached track");
        let track = serde_json::from_str::<Track>(&cached.unwrap())?;
        rocksky::scrobble(cache, &did, track, scrobble.time).await?;
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        return Ok(());
    }

    tracing::info!(artist = %scrobble.data.song.parsed.artist, track = %scrobble.data.song.parsed.track, "Searching for track (not cached)");

    let result = repo::track::get_track(
        pool,
        &scrobble.data.song.parsed.track,
        &scrobble.data.song.parsed.artist,
    )
    .await?;

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
        track.release_date = album
            .release_date
            .map(|x| x.split("T").next().unwrap().to_string());
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
    let client_id = spotify_token.spotify_app_id.clone();

    let client_secret = decrypt_aes_256_ctr(
        &spotify_token.spotify_secret,
        &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
    )?;

    let spotify_token = decrypt_aes_256_ctr(
        &spotify_token.refresh_token,
        &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
    )?;

    let spotify_token = refresh_token(&spotify_token, &client_id, &client_secret).await?;
    let spotify_client = SpotifyClient::new(&spotify_token.access_token);

    let query = match scrobble.data.song.parsed.artist.contains(" x ") {
        true => {
            let artists = scrobble
                .data
                .song
                .parsed
                .artist
                .split(" x ")
                .map(|a| format!(r#"artist:"{}""#, a.trim()))
                .collect::<Vec<_>>()
                .join(" ");
            format!(r#"track:"{}" {}"#, scrobble.data.song.parsed.track, artists)
        }
        false => match scrobble.data.song.parsed.artist.contains(", ") {
            true => {
                let artists = scrobble
                    .data
                    .song
                    .parsed
                    .artist
                    .split(", ")
                    .map(|a| format!(r#"artist:"{}""#, a.trim()))
                    .collect::<Vec<_>>()
                    .join(" ");
                format!(r#"track:"{}" {}"#, scrobble.data.song.parsed.track, artists)
            }
            false => format!(
                r#"track:"{}" artist:"{}""#,
                scrobble.data.song.parsed.track,
                scrobble.data.song.parsed.artist.trim()
            ),
        },
    };

    tracing::info!(query = %query, "Searching on Spotify");

    let result = retry_spotify_call(
        || async {
            tokio::time::timeout(
                std::time::Duration::from_secs(5),
                spotify_client.search(&query),
            )
            .await?
        },
        "search",
    )
    .await?;

    tracing::info!(total = %result.tracks.total, "Spotify search results");

    if let Some(track) = result.tracks.items.first() {
        let normalize = |s: &str| -> String {
            s.to_lowercase()
                .chars()
                .filter_map(|c| match c {
                    'á' | 'à' | 'ä' | 'â' | 'ã' | 'å' => Some('a'),
                    'é' | 'è' | 'ë' | 'ê' => Some('e'),
                    'í' | 'ì' | 'ï' | 'î' => Some('i'),
                    'ó' | 'ò' | 'ö' | 'ô' | 'õ' => Some('o'),
                    'ú' | 'ù' | 'ü' | 'û' => Some('u'),
                    'ñ' => Some('n'),
                    'ç' => Some('c'),
                    _ => Some(c),
                })
                .collect()
        };

        let spotify_artists: Vec<String> =
            track.artists.iter().map(|a| normalize(&a.name)).collect();

        let artist = scrobble.data.song.parsed.artist.trim();
        // check if artists don't contain the scrobble artist (to avoid wrong matches)
        // scrobble artist can contain multiple artists separated by ", "
        let scrobble_artists: Vec<String> = scrobble
            .data
            .song
            .parsed
            .artist
            .split(", ")
            .map(|a| normalize(a.trim()))
            .collect();

        // Check for matches with partial matching:
        // 1. Check if any scrobble artist is contained in any Spotify artist
        // 2. Check if any Spotify artist is contained in any scrobble artist
        let has_artist_match = scrobble_artists.iter().any(|scrobble_artist| {
            spotify_artists.iter().any(|spotify_artist| {
                scrobble_artist.contains(spotify_artist) || spotify_artist.contains(scrobble_artist)
            })
        });

        if !has_artist_match {
            tracing::warn!(artist = %artist, track = ?track, "Artist mismatch, skipping");
        } else {
            tracing::info!("Spotify (track)");
            let mut track = track.clone();

            if let Some(album) = retry_spotify_call(
                || async { spotify_client.get_album(&track.album.id).await },
                "get_album",
            )
            .await?
            {
                track.album = album;
            }

            if let Some(artist) = retry_spotify_call(
                || async { spotify_client.get_artist(&track.album.artists[0].id).await },
                "get_artist",
            )
            .await?
            {
                track.album.artists[0] = artist;
            }

            rocksky::scrobble(cache, &did, track.into(), scrobble.time).await?;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            return Ok(());
        }
    }

    let query = format!(
        r#"recording:"{}" AND artist:"{}" AND status:Official"#,
        scrobble.data.song.parsed.track, scrobble.data.song.parsed.artist
    );

    let result = search_musicbrainz_recording(&query, mb_client, &scrobble).await;
    if let Err(e) = result {
        tracing::warn!(artist = %scrobble.data.song.parsed.artist, track = %scrobble.data.song.parsed.track, "Musicbrainz search error: {}", e);
        return Ok(());
    }
    let result = result.unwrap();
    if let Some(result) = result {
        tracing::info!("Musicbrainz (recording)");
        rocksky::scrobble(cache, &did, result.into(), scrobble.time).await?;
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        return Ok(());
    }

    tracing::warn!(artist = %scrobble.data.song.parsed.artist, track = %scrobble.data.song.parsed.track, "Track not found, skipping");

    Ok(())
}

async fn search_musicbrainz_recording(
    query: &str,
    mb_client: &MusicbrainzClient,
    scrobble: &ScrobbleRequest,
) -> Result<Option<Recording>, Error> {
    let result = mb_client.search(&query).await;
    if let Err(e) = result {
        tracing::warn!(artist = %scrobble.data.song.parsed.artist, track = %scrobble.data.song.parsed.track, "Musicbrainz search error: {}", e);
        return Ok(None);
    }
    let result = result.unwrap();

    let release = get_best_release_from_recordings(&result, &scrobble.data.song.parsed.artist);

    if let Some(release) = release {
        let recording = result.recordings.into_iter().find(|r| {
            r.releases
                .as_ref()
                .map(|releases| releases.iter().any(|rel| rel.id == release.id))
                .unwrap_or(false)
        });
        if recording.is_none() {
            tracing::warn!(artist = %scrobble.data.song.parsed.artist, track = %scrobble.data.song.parsed.track, "Recording not found in MusicBrainz result, skipping");
            return Ok(None);
        }
        let recording = recording.unwrap();
        let mut result = mb_client.get_recording(&recording.id).await?;
        tracing::info!("Musicbrainz (recording)");
        result.releases = Some(vec![release]);
        return Ok(Some(result));
    }

    Ok(None)
}

async fn retry_spotify_call<F, Fut, T>(mut f: F, operation: &str) -> Result<T, Error>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, Error>>,
{
    let mut last_error = None;

    for attempt in 0..MAX_SPOTIFY_RETRIES {
        match f().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                let is_timeout = e.to_string().contains("timed out")
                    || e.to_string().contains("timeout")
                    || e.to_string().contains("operation timed out");

                if is_timeout && attempt < MAX_SPOTIFY_RETRIES - 1 {
                    let delay = INITIAL_RETRY_DELAY_MS * 2_u64.pow(attempt);
                    tracing::warn!(
                        attempt = attempt + 1,
                        max_attempts = MAX_SPOTIFY_RETRIES,
                        delay_ms = delay,
                        operation = operation,
                        "Spotify API timeout, retrying..."
                    );
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
                    last_error = Some(e);
                } else {
                    return Err(e);
                }
            }
        }
    }

    Err(last_error.unwrap_or_else(|| Error::msg("Max retries exceeded")))
}
