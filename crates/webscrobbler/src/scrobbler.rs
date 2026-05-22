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

/// Resolve a track by artist/title through cache → DB → Spotify → MusicBrainz.
/// Returns `None` if no match is found anywhere.
pub async fn resolve_track(
    pool: &Pool<Postgres>,
    cache: &Cache,
    mb_client: &MusicbrainzClient,
    artist: &str,
    track_name: &str,
) -> Result<Option<Track>, Error> {
    let key = format!("{} - {}", artist.to_lowercase(), track_name.to_lowercase());

    // 1. Cache
    if let Some(cached) = cache.get(&key)? {
        tracing::info!(%artist, %track_name, "Using cached track");
        return Ok(Some(serde_json::from_str::<Track>(&cached)?));
    }

    tracing::info!(%artist, %track_name, "Resolving track (not cached)");

    // 2. DB
    if let Some(db_track) = repo::track::get_track(pool, track_name, artist).await? {
        println!("{}", "Xata (track)".yellow());
        let album = repo::album::get_album_by_track_id(pool, &db_track.xata_id).await?;
        let db_artist = repo::artist::get_artist_by_track_id(pool, &db_track.xata_id).await?;
        let mut track: Track = db_track.into();
        track.year = match album.year {
            Some(year) => Some(year as u32),
            None => match album.release_date.clone() {
                Some(release_date) => release_date
                    .split('-')
                    .next()
                    .and_then(|x| x.parse::<u32>().ok()),
                None => None,
            },
        };
        track.release_date = album
            .release_date
            .map(|x| x.split('T').next().unwrap().to_string());
        track.artist_picture = db_artist.picture.clone();
        return Ok(Some(track));
    }

    // 3. Spotify
    let spotify_tokens = repo::spotify_token::get_spotify_tokens(pool, 100).await?;
    if !spotify_tokens.is_empty() {
        let mut rng = rand::rng();
        let random_index = rng.random_range(0..spotify_tokens.len());
        let spotify_token = &spotify_tokens[random_index];
        let client_id = spotify_token.spotify_app_id.clone();

        let client_secret = decrypt_aes_256_ctr(
            &spotify_token.spotify_secret,
            &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
        )?;
        let spotify_refresh = decrypt_aes_256_ctr(
            &spotify_token.refresh_token,
            &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
        )?;
        let spotify_token = refresh_token(&spotify_refresh, &client_id, &client_secret).await?;
        let spotify_client = SpotifyClient::new(&spotify_token.access_token);

        let query = build_spotify_query(artist, track_name);
        tracing::info!(query = %query, "Searching on Spotify");

        if let Ok(result) = retry_spotify_call(
            || async {
                tokio::time::timeout(
                    std::time::Duration::from_secs(5),
                    spotify_client.search(&query),
                )
                .await?
            },
            "search",
        )
        .await
        {
            tracing::info!(total = %result.tracks.total, "Spotify search results");

            if let Some(sp_track) = result.tracks.items.first() {
                let normalize = accent_normalize;
                let spotify_artists: Vec<String> = sp_track
                    .artists
                    .iter()
                    .map(|a| normalize(&a.name))
                    .collect();
                let scrobble_artists: Vec<String> =
                    artist.split(", ").map(|a| normalize(a.trim())).collect();

                let has_artist_match = scrobble_artists.iter().any(|sa| {
                    spotify_artists
                        .iter()
                        .any(|spa| sa.contains(spa.as_str()) || spa.contains(sa.as_str()))
                });

                if has_artist_match {
                    tracing::info!("Spotify (track)");
                    let mut sp_track = sp_track.clone();

                    if let Ok(Some(album)) = retry_spotify_call(
                        || async { spotify_client.get_album(&sp_track.album.id).await },
                        "get_album",
                    )
                    .await
                    {
                        sp_track.album = album;
                    }

                    if let Ok(Some(sp_artist)) = retry_spotify_call(
                        || async {
                            spotify_client
                                .get_artist(&sp_track.album.artists[0].id)
                                .await
                        },
                        "get_artist",
                    )
                    .await
                    {
                        sp_track.album.artists[0] = sp_artist;
                    }

                    return Ok(Some(sp_track.into()));
                } else {
                    tracing::warn!(%artist, "Spotify artist mismatch, falling through to MusicBrainz");
                }
            }
        }
    }

    // 4. MusicBrainz
    let mb_query = format!(
        r#"recording:"{}" AND artist:"{}" AND status:Official"#,
        track_name, artist
    );
    if let Ok(Some(recording)) =
        search_musicbrainz_recording(&mb_query, mb_client, artist, track_name).await
    {
        tracing::info!("MusicBrainz (recording)");
        return Ok(Some(recording.into()));
    }

    tracing::warn!(%artist, %track_name, "Track not found anywhere");
    Ok(None)
}

pub async fn scrobble(
    pool: &Pool<Postgres>,
    cache: &Cache,
    mb_client: &MusicbrainzClient,
    scrobble: ScrobbleRequest,
    did: &str,
) -> Result<(), Error> {
    let artist = scrobble.data.song.parsed.artist.clone();
    let track_name = scrobble.data.song.parsed.track.clone();

    if let Some(track) = resolve_track(pool, cache, mb_client, &artist, &track_name).await? {
        rocksky::scrobble(cache, did, track, scrobble.time).await?;
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    } else {
        tracing::warn!(%artist, %track_name, "Track not found, skipping scrobble");
    }

    Ok(())
}

fn accent_normalize(s: &str) -> String {
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
}

fn build_spotify_query(artist: &str, track_name: &str) -> String {
    if artist.contains(" x ") {
        let artists = artist
            .split(" x ")
            .map(|a| format!(r#"artist:"{}""#, a.trim()))
            .collect::<Vec<_>>()
            .join(" ");
        format!(r#"track:"{}" {}"#, track_name, artists)
    } else if artist.contains(", ") {
        let artists = artist
            .split(", ")
            .map(|a| format!(r#"artist:"{}""#, a.trim()))
            .collect::<Vec<_>>()
            .join(" ");
        format!(r#"track:"{}" {}"#, track_name, artists)
    } else {
        format!(r#"track:"{}" artist:"{}""#, track_name, artist.trim())
    }
}

async fn search_musicbrainz_recording(
    query: &str,
    mb_client: &MusicbrainzClient,
    artist: &str,
    track_name: &str,
) -> Result<Option<Recording>, Error> {
    let result = mb_client.search(query).await;
    if let Err(e) = result {
        tracing::warn!(%artist, %track_name, "MusicBrainz search error: {}", e);
        return Ok(None);
    }
    let result = result.unwrap();

    let release = get_best_release_from_recordings(&result, artist);

    if let Some(release) = release {
        let recording = result.recordings.into_iter().find(|r| {
            r.releases
                .as_ref()
                .map(|releases| releases.iter().any(|rel| rel.id == release.id))
                .unwrap_or(false)
        });
        if recording.is_none() {
            tracing::warn!(%artist, %track_name, "Recording not found in MusicBrainz result, skipping");
            return Ok(None);
        }
        let recording = recording.unwrap();
        let mut result = mb_client.get_recording(&recording.id).await?;
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
