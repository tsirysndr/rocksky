use std::{collections::BTreeMap, env};

use anyhow::Error;
use rand::Rng;
use sqlx::{Pool, Postgres};

use crate::{
    auth::{decode_token, extract_did},
    cache::Cache,
    crypto::decrypt_aes_256_ctr,
    listenbrainz::types::SubmitListensRequest,
    musicbrainz::{
        client::MusicbrainzClient, get_best_release_from_recordings, recording::Recording,
    },
    repo::{self},
    rocksky,
    spotify::{client::SpotifyClient, refresh_token},
    types::{Scrobble, Track},
    xata::user::User,
};

fn parse_batch(form: &BTreeMap<String, String>) -> Result<Vec<Scrobble>, Error> {
    let mut result = vec![];
    let mut index = 0;

    loop {
        let artist = form.get(&format!("artist[{}]", index));
        let track = form.get(&format!("track[{}]", index));
        let timestamp = form.get(&format!("timestamp[{}]", index));

        if artist.is_none() || track.is_none() || timestamp.is_none() {
            break;
        }

        let album = form
            .get(&format!("album[{}]", index))
            .cloned()
            .map(|x| x.trim().to_string());
        let context = form
            .get(&format!("context[{}]", index))
            .cloned()
            .map(|x| x.trim().to_string());
        let stream_id = form
            .get(&format!("streamId[{}]", index))
            .and_then(|s| s.trim().parse().ok());
        let chosen_by_user = form
            .get(&format!("chosenByUser[{}]", index))
            .and_then(|s| s.trim().parse().ok());
        let track_number = form
            .get(&format!("trackNumber[{}]", index))
            .and_then(|s| s.trim().parse().ok());
        let mbid = form.get(&format!("mbid[{}]", index)).cloned();
        let album_artist = form
            .get(&format!("albumArtist[{}]", index))
            .map(|x| x.trim().to_string());
        let duration = form
            .get(&format!("duration[{}]", index))
            .and_then(|s| s.trim().parse().ok());

        let timestamp = timestamp
            .unwrap()
            .trim()
            .parse()
            .unwrap_or(chrono::Utc::now().timestamp() as u64);

        // validate timestamp, must be in the past (between 14 days before to present)
        let now = chrono::Utc::now().timestamp() as u64;
        if timestamp > now {
            return Err(Error::msg("Timestamp is in the future"));
        }

        if timestamp < now - 14 * 24 * 60 * 60 {
            return Err(Error::msg("Timestamp is too old"));
        }

        result.push(Scrobble {
            artist: artist.unwrap().trim().to_string(),
            track: track.unwrap().trim().to_string(),
            timestamp,
            album,
            context,
            stream_id,
            chosen_by_user,
            track_number,
            mbid,
            album_artist,
            duration,
            ignored: None,
        });

        index += 1;
    }

    Ok(result)
}

pub async fn scrobble(
    pool: &Pool<Postgres>,
    cache: &Cache,
    mb_client: &MusicbrainzClient,
    form: &BTreeMap<String, String>,
) -> Result<Vec<Scrobble>, Error> {
    let mut scrobbles = parse_batch(form)?;

    if scrobbles.is_empty() {
        return Err(Error::msg("No scrobbles found"));
    }

    let did = extract_did(pool, form).await?;

    let spofity_tokens = repo::spotify_token::get_spotify_tokens(pool, 100).await?;

    if spofity_tokens.is_empty() {
        return Err(Error::msg("No Spotify tokens found"));
    }

    for scrobble in &mut scrobbles {
        /*
           0. check if scrobble is cached
           1. if mbid is present, check if it exists in the database
           2. if it exists, scrobble
           3. if it doesn't exist, check if it exists in Musicbrainz (using mbid)
           4. if it exists, get album art from spotify and scrobble
           5. if it doesn't exist, check if it exists in Spotify
           6. if it exists, scrobble
           7. if it doesn't exist, check if it exists in Musicbrainz (using track and artist)
           8. if it exists, scrobble
           9. if it doesn't exist, skip unknown track
        */
        let key = format!(
            "{} - {}",
            scrobble.artist.to_lowercase(),
            scrobble.track.to_lowercase()
        );
        let cached = cache.get(&key)?;
        if cached.is_some() {
            tracing::info!(key = %key, "Cached:");
            let track = serde_json::from_str::<Track>(&cached.unwrap())?;
            scrobble.album = Some(track.album.clone());
            rocksky::scrobble(cache, &did, track, scrobble.timestamp).await?;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            continue;
        }

        if let Some(mbid) = &scrobble.mbid {
            // let result = repo::track::get_track_by_mbid(pool, mbid).await?;
            let result = mb_client.get_recording(mbid).await?;
            tracing::info!(%scrobble.artist, %scrobble.track, "Musicbrainz (mbid)");
            scrobble.album = Some(Track::from(result.clone()).album);
            rocksky::scrobble(cache, &did, result.into(), scrobble.timestamp).await?;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            continue;
        }

        let result = repo::track::get_track(pool, &scrobble.track, &scrobble.artist).await?;

        if let Some(track) = result {
            tracing::info!(artist = %scrobble.artist, track = %scrobble.track, "Xata (track)");
            scrobble.album = Some(track.album.clone());
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

            rocksky::scrobble(cache, &did, track, scrobble.timestamp).await?;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            continue;
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

        let result = spotify_client
            .search(&format!(
                r#"track:"{}" artist:"{}""#,
                scrobble.track, scrobble.artist
            ))
            .await?;

        if let Some(track) = result.tracks.items.first() {
            tracing::info!(artist = %scrobble.artist, track = %scrobble.track, "Spotify (track)");
            scrobble.album = Some(track.album.name.clone());
            let mut track = track.clone();

            if let Some(album) = spotify_client.get_album(&track.album.id).await? {
                track.album = album;
            }

            if let Some(artist) = spotify_client
                .get_artist(&track.album.artists[0].id)
                .await?
            {
                track.album.artists[0] = artist;
            }

            rocksky::scrobble(cache, &did, track.into(), scrobble.timestamp).await?;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            continue;
        }

        let query = format!(
            r#"recording:"{}" AND artist:"{}" AND status:Official"#,
            scrobble.track, scrobble.artist
        );
        let result = mb_client.search(&query).await?;

        if let Some(recording) = result.recordings.first() {
            let result = mb_client.get_recording(&recording.id).await?;
            tracing::info!(%scrobble.artist, %scrobble.track, "Musicbrainz (recording)");
            scrobble.album = Some(Track::from(result.clone()).album);
            rocksky::scrobble(cache, &did, result.into(), scrobble.timestamp).await?;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            continue;
        }

        tracing::info!(artist = %scrobble.artist, track = %scrobble.track, "Track not found, skipping");
        scrobble.ignored = Some(true);
    }

    Ok(scrobbles.clone())
}

pub async fn scrobble_v1(
    pool: &Pool<Postgres>,
    cache: &Cache,
    mb_client: &MusicbrainzClient,
    form: &BTreeMap<String, String>,
) -> Result<(), Error> {
    let session_id = form.get("s").unwrap().to_string();
    let artist = form.get("a[0]").unwrap().to_string();
    let track = form.get("t[0]").unwrap().to_string();
    let timestamp = form.get("i[0]").unwrap().to_string();

    let user = cache.get(&format!("lastfm:{}", session_id))?;
    if user.is_none() {
        return Err(Error::msg("Session ID not found"));
    }

    let user = user.unwrap();
    let user = serde_json::from_str::<User>(&user)?;

    let spofity_tokens = repo::spotify_token::get_spotify_tokens(pool, 100).await?;

    if spofity_tokens.is_empty() {
        return Err(Error::msg("No Spotify tokens found"));
    }

    let mut scrobble = Scrobble {
        artist: artist.trim().to_string(),
        track: track.trim().to_string(),
        timestamp: timestamp.parse::<u64>()?,
        album: None,
        context: None,
        stream_id: None,
        chosen_by_user: None,
        track_number: None,
        mbid: None,
        album_artist: None,
        duration: None,
        ignored: None,
    };

    let did = user.did.clone();

    /*
    0. check if scrobble is cached
    1. if mbid is present, check if it exists in the database
    2. if it exists, scrobble
    3. if it doesn't exist, check if it exists in Musicbrainz (using mbid)
    4. if it exists, get album art from spotify and scrobble
    5. if it doesn't exist, check if it exists in Spotify
    6. if it exists, scrobble
    7. if it doesn't exist, check if it exists in Musicbrainz (using track and artist)
    8. if it exists, scrobble
    9. if it doesn't exist, skip unknown track
    */
    let key = format!(
        "{} - {}",
        scrobble.artist.to_lowercase(),
        scrobble.track.to_lowercase()
    );
    let cached = cache.get(&key)?;
    if cached.is_some() {
        tracing::info!(key = %key, "Cached:");
        let track = serde_json::from_str::<Track>(&cached.unwrap())?;
        scrobble.album = Some(track.album.clone());
        rocksky::scrobble(cache, &did, track, scrobble.timestamp).await?;
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        return Ok(());
    }

    if let Some(mbid) = &scrobble.mbid {
        // let result = repo::track::get_track_by_mbid(pool, mbid).await?;
        let result = mb_client.get_recording(mbid).await?;
        tracing::info!(%scrobble.artist, %scrobble.track, "Musicbrainz (mbid)");
        scrobble.album = Some(Track::from(result.clone()).album);
        rocksky::scrobble(cache, &did, result.into(), scrobble.timestamp).await?;
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        return Ok(());
    }

    let result = repo::track::get_track(pool, &scrobble.track, &scrobble.artist).await?;

    if let Some(track) = result {
        tracing::info!(artist = %scrobble.artist, track = %scrobble.track, "Xata (track)");
        scrobble.album = Some(track.album.clone());
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

        rocksky::scrobble(cache, &did, track, scrobble.timestamp).await?;
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

    let result = spotify_client
        .search(&format!(
            r#"track:"{}" artist:"{}""#,
            scrobble.track, scrobble.artist
        ))
        .await?;

    if let Some(track) = result.tracks.items.first() {
        let artists = track
            .artists
            .iter()
            .map(|a| a.name.to_lowercase().clone())
            .collect::<Vec<_>>()
            .join(", ")
            .to_lowercase();

        // check if artists don't contain the scrobble artist (to avoid wrong matches)
        // scrobble artist can contain multiple artists separated by ", "
        let scrobble_artists: Vec<String> = scrobble
            .artist
            .split(", ")
            .map(|a| a.trim().to_lowercase())
            .collect();

        let has_artist_match = scrobble_artists
            .iter()
            .any(|scrobble_artist| artists.contains(scrobble_artist));

        if !has_artist_match {
            tracing::warn!(artist = %artist, track = ?track, "Artist mismatch, skipping");
        } else {
            tracing::info!(artist = %scrobble.artist, track = %scrobble.track, "Spotify (track)");
            scrobble.album = Some(track.album.name.clone());
            let mut track = track.clone();

            if let Some(album) = spotify_client.get_album(&track.album.id).await? {
                track.album = album;
            }

            if let Some(artist) = spotify_client
                .get_artist(&track.album.artists[0].id)
                .await?
            {
                track.album.artists[0] = artist;
            }

            rocksky::scrobble(cache, &did, track.into(), scrobble.timestamp).await?;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            return Ok(());
        }
    }

    let query = format!(
        r#"recording:"{}" AND artist:"{}" AND status:Official"#,
        scrobble.track, scrobble.artist
    );
    let result = search_musicbrainz_recording(&query, mb_client, &scrobble).await;
    if let Err(e) = result {
        tracing::warn!(artist = %scrobble.artist, track = %scrobble.track, "Musicbrainz search error: {}", e);
        return Ok(());
    }
    let result = result.unwrap();
    if let Some(recording) = result {
        let result = mb_client.get_recording(&recording.id).await?;
        tracing::info!(%scrobble.artist, %scrobble.track, "Musicbrainz (recording)");
        scrobble.album = Some(Track::from(result.clone()).album);
        rocksky::scrobble(cache, &did, result.into(), scrobble.timestamp).await?;
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        return Ok(());
    }

    tracing::info!(artist = %artist, track = %track, "Track not found, skipping");

    Ok(())
}

pub async fn scrobble_listenbrainz(
    pool: &Pool<Postgres>,
    cache: &Cache,
    mb_client: &MusicbrainzClient,
    req: &SubmitListensRequest,
    token: &str,
) -> Result<(), Error> {
    tracing::info!(req = ?req, "Listenbrainz submission");

    if req.payload.is_empty() {
        return Err(Error::msg("No payload found"));
    }

    let artist = req.payload[0].track_metadata.artist_name.clone();
    let track = req.payload[0].track_metadata.track_name.clone();
    let timestamp = match req.payload[0].listened_at {
        Some(timestamp) => timestamp.to_string(),
        None => chrono::Utc::now().timestamp().to_string(),
    };

    let did = match decode_token(token) {
        Ok(claims) => claims.did,
        Err(e) => {
            let user = repo::user::get_user_by_apikey(pool, token)
                .await?
                .map(|user| user.did);
            if let Some(did) = user {
                did
            } else {
                return Err(Error::msg(format!(
                    "Failed to decode token: {} {}",
                    e, token
                )));
            }
        }
    };

    let user = repo::user::get_user_by_did(pool, &did).await?;

    if user.is_none() {
        return Err(Error::msg("User not found"));
    }

    cache.setex(
        &format!("listenbrainz:emby:{}:{}:{}", artist, track, did),
        "1",
        60 * 5, // 5 minutes
    )?;

    if cache
        .get(&format!("listenbrainz:cache:{}:{}:{}", artist, track, did))?
        .is_some()
    {
        tracing::info!(artist= %artist, track = %track, "Recently scrobbled, skipping");
        return Ok(());
    }

    let spotify_user = repo::spotify_account::get_spotify_account(pool, &did).await?;
    if let Some(spotify_user) = spotify_user {
        if cache
            .get(&format!("{}:current", spotify_user.email))?
            .is_some()
        {
            tracing::info!(artist= %artist, track = %track, "Currently scrobbling, skipping");
            return Ok(());
        }
    }

    if cache.get(&format!("nowplaying:{}", did))?.is_some() {
        tracing::info!(artist= %artist, track = %track, "Currently scrobbling, skipping");
        return Ok(());
    }

    // set cache for 5 seconds to avoid duplicate scrobbles
    cache.setex(
        &format!("listenbrainz:cache:{}:{}:{}", artist, track, did),
        "1",
        5,
    )?;

    let spofity_tokens = repo::spotify_token::get_spotify_tokens(pool, 100).await?;

    if spofity_tokens.is_empty() {
        return Err(Error::msg("No Spotify tokens found"));
    }

    let mut scrobble = Scrobble {
        artist: artist.trim().to_string(),
        track: track.trim().to_string(),
        timestamp: timestamp.parse::<u64>()?,
        album: None,
        context: None,
        stream_id: None,
        chosen_by_user: None,
        track_number: None,
        mbid: None,
        album_artist: None,
        duration: None,
        ignored: None,
    };

    /*
    0. check if scrobble is cached
    1. if mbid is present, check if it exists in the database
    2. if it exists, scrobble
    3. if it doesn't exist, check if it exists in Musicbrainz (using mbid)
    4. if it exists, get album art from spotify and scrobble
    5. if it doesn't exist, check if it exists in Spotify
    6. if it exists, scrobble
    7. if it doesn't exist, check if it exists in Musicbrainz (using track and artist)
    8. if it exists, scrobble
    9. if it doesn't exist, skip unknown track
    */
    let key = format!(
        "{} - {}",
        scrobble.artist.to_lowercase(),
        scrobble.track.to_lowercase()
    );
    let cached = cache.get(&key)?;
    if cached.is_some() {
        tracing::info!(key = %key, "Cached");
        let track = serde_json::from_str::<Track>(&cached.unwrap())?;
        scrobble.album = Some(track.album.clone());
        rocksky::scrobble(cache, &did, track, scrobble.timestamp).await?;
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        return Ok(());
    }

    if let Some(mbid) = &scrobble.mbid {
        // let result = repo::track::get_track_by_mbid(pool, mbid).await?;
        let result = mb_client.get_recording(mbid).await?;
        tracing::info!("Musicbrainz (mbid)");
        scrobble.album = Some(Track::from(result.clone()).album);
        rocksky::scrobble(cache, &did, result.into(), scrobble.timestamp).await?;
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        return Ok(());
    }

    let result = repo::track::get_track(pool, &scrobble.track, &scrobble.artist).await?;

    if let Some(track) = result {
        tracing::info!(id = %track.xata_id, artist = %track.artist, album = %track.album, album_atist = %track.album_artist, album_uri = ?track.album_uri, artist_uri = ?track.artist_uri, "Xata (track)");
        scrobble.album = Some(track.album.clone());
        let album =
            repo::album::get_album_by_uri(pool, &track.album_uri.clone().unwrap_or_default())
                .await?;
        let artist =
            repo::artist::get_artist_by_uri(pool, &track.artist_uri.clone().unwrap_or_default())
                .await?;
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

        rocksky::scrobble(cache, &did, track, scrobble.timestamp).await?;
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

    let result = spotify_client
        .search(&format!(
            r#"track:"{}" artist:"{}""#,
            scrobble.track, scrobble.artist
        ))
        .await?;

    if let Some(track) = result.tracks.items.first() {
        let artists = track
            .artists
            .iter()
            .map(|a| a.name.to_lowercase().clone())
            .collect::<Vec<_>>()
            .join(", ")
            .to_lowercase();

        // check if artists don't contain the scrobble artist (to avoid wrong matches)
        if !artists.contains(&scrobble.artist.to_lowercase()) {
            tracing::warn!(artist = %artist, track = ?track, "Artist mismatch, skipping");
        } else {
            tracing::info!("Spotify (track)");
            scrobble.album = Some(track.album.name.clone());
            let mut track = track.clone();

            if let Some(album) = spotify_client.get_album(&track.album.id).await? {
                track.album = album;
            }

            if let Some(artist) = spotify_client
                .get_artist(&track.album.artists[0].id)
                .await?
            {
                track.album.artists[0] = artist;
            }

            rocksky::scrobble(cache, &did, track.into(), scrobble.timestamp).await?;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            return Ok(());
        }
    }

    let query = format!(
        r#"recording:"{}" AND artist:"{}" AND status:Official"#,
        scrobble.track, scrobble.artist
    );
    let result = search_musicbrainz_recording(&query, mb_client, &scrobble).await;
    if let Err(e) = result {
        tracing::warn!(artist = %artist, track = %track, "Musicbrainz search error: {}", e);
        return Ok(());
    }
    let result = result.unwrap();
    if let Some(result) = result {
        tracing::info!("Musicbrainz (recording)");
        rocksky::scrobble(cache, &did, result.into(), scrobble.timestamp).await?;
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        return Ok(());
    }

    tracing::warn!(artist = %artist, track = %track, "Track not found, skipping");

    Ok(())
}

async fn search_musicbrainz_recording(
    query: &str,
    mb_client: &MusicbrainzClient,
    scrobble: &Scrobble,
) -> Result<Option<Recording>, Error> {
    let result = mb_client.search(&query).await;
    if let Err(e) = result {
        tracing::warn!(artist = %scrobble.artist, track = %scrobble.track, "Musicbrainz search error: {}", e);
        return Ok(None);
    }
    let result = result.unwrap();

    let release = get_best_release_from_recordings(&result, &scrobble.artist);

    if let Some(release) = release {
        let recording = result.recordings.into_iter().find(|r| {
            r.releases
                .as_ref()
                .map(|releases| releases.iter().any(|rel| rel.id == release.id))
                .unwrap_or(false)
        });
        if recording.is_none() {
            tracing::warn!(artist = %scrobble.artist, track = %scrobble.track, "Recording not found in MusicBrainz result, skipping");
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
