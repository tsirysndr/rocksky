use crate::{
    auth::{decode_token, extract_did},
    cache::Cache,
    listenbrainz::types::SubmitListensRequest,
    repo, rocksky,
    types::{Scrobble, Track},
    xata::user::User,
};
use anyhow::Error;
use rocksky_db::Backend;
use rocksky_matching::{client::MatchingClient, Identifiers, MatchRequest};
use std::collections::BTreeMap;

fn optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

pub fn matching_request(scrobble: &Scrobble) -> MatchRequest {
    MatchRequest {
        title: scrobble.track.clone(),
        artists: vec![scrobble.artist.clone()],
        album: optional(scrobble.album.as_deref()),
        album_artist: optional(scrobble.album_artist.as_deref()),
        // AudioScrobbler durations are seconds; the matching protocol is milliseconds.
        duration_ms: scrobble
            .duration
            .filter(|n| *n > 0)
            .map(|n| u64::from(n) * 1000),
        identifiers: Identifiers {
            musicbrainz_recording_id: optional(scrobble.mbid.as_deref()),
            ..Default::default()
        },
    }
}

async fn submit_matched(
    cache: &Cache,
    matcher: &MatchingClient,
    did: &str,
    scrobble: &mut Scrobble,
) -> Result<(), Error> {
    if let Some(candidate) = matcher.match_track(&matching_request(scrobble)).await? {
        let track: Track = candidate.into();
        scrobble.album = Some(track.album.clone());
        rocksky::scrobble(cache, did, track, scrobble.timestamp).await?;
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    } else {
        scrobble.ignored = Some(true);
        tracing::info!(artist = %scrobble.artist, title = %scrobble.track, "No unambiguous match; skipping scrobble");
    }
    Ok(())
}

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
    pool: &Backend,
    cache: &Cache,
    matcher: &MatchingClient,
    form: &BTreeMap<String, String>,
) -> Result<Vec<Scrobble>, Error> {
    let mut scrobbles = parse_batch(form)?;
    anyhow::ensure!(!scrobbles.is_empty(), "No scrobbles found");
    let did = extract_did(pool, form).await?;
    for scrobble in &mut scrobbles {
        submit_matched(cache, matcher, &did, scrobble).await?;
    }
    Ok(scrobbles)
}

pub async fn scrobble_v1(
    _pool: &Backend,
    cache: &Cache,
    matcher: &MatchingClient,
    form: &BTreeMap<String, String>,
) -> Result<(), Error> {
    let field = |key: &str| {
        form.get(key)
            .ok_or_else(|| Error::msg(format!("Missing {key}")))
    };
    let session_id = field("s")?;
    let user = cache
        .get(&format!("lastfm:{session_id}"))?
        .ok_or_else(|| Error::msg("Session ID not found"))?;
    let user: User = serde_json::from_str(&user)?;
    let mut scrobble = Scrobble {
        artist: field("a[0]")?.trim().to_owned(),
        track: field("t[0]")?.trim().to_owned(),
        timestamp: field("i[0]")?.parse()?,
        album: optional(form.get("b[0]").map(String::as_str)),
        mbid: optional(form.get("m[0]").map(String::as_str)),
        duration: form.get("l[0]").and_then(|v| v.parse().ok()),
        track_number: form.get("n[0]").and_then(|v| v.parse().ok()),
        album_artist: None,
        context: None,
        stream_id: None,
        chosen_by_user: None,
        ignored: None,
    };
    submit_matched(cache, matcher, &user.did, &mut scrobble).await
}

pub async fn scrobble_listenbrainz(
    pool: &Backend,
    cache: &Cache,
    matcher: &MatchingClient,
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
                return Err(Error::msg(format!("Failed to decode token: {}", e)));
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

    // set cache for 60 seconds to avoid duplicate scrobbles
    cache.setex(
        &format!("listenbrainz:cache:{}:{}:{}", artist, track, did),
        "1",
        30, // 30 seconds
    )?;

    let meta = &req.payload[0].track_metadata;
    let request = listenbrainz_matching_request(meta);
    if let Some(candidate) = matcher.match_track(&request).await? {
        rocksky::scrobble(cache, &did, candidate.into(), timestamp.parse()?).await?;
    } else {
        tracing::info!(%artist, %track, "No unambiguous match; skipping listen");
    }
    Ok(())
}

pub fn listenbrainz_matching_request(
    meta: &crate::listenbrainz::types::TrackMetadata,
) -> MatchRequest {
    let info = meta.additional_info.as_ref();
    let extra = |key: &str| {
        info.and_then(|i| i.extra.get(key))
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned)
    };
    MatchRequest {
        title: meta.track_name.clone(),
        artists: vec![meta.artist_name.clone()],
        album: optional(
            meta.release_name
                .as_deref()
                .or_else(|| info.and_then(|i| i.release_name.as_deref())),
        ),
        album_artist: extra("albumartist"),
        duration_ms: info
            .and_then(|i| i.duration_ms())
            .and_then(|ms| ms.try_into().ok()),
        identifiers: Identifiers {
            musicbrainz_recording_id: extra("recording_mbid")
                .or_else(|| info.and_then(|i| i.musicbrainz_track_id.clone())),
            musicbrainz_release_id: extra("release_mbid"),
            isrc: extra("isrc"),
            spotify_track_id: extra("spotify_id")
                .and_then(|s| rocksky_matching::client::spotify_track_id(&s)),
            ..Default::default()
        },
    }
}

#[cfg(test)]
mod matching_tests {
    use super::*;
    #[test]
    fn batch_preserves_album_mbid_and_seconds() {
        let timestamp = chrono::Utc::now().timestamp().to_string();
        let form = BTreeMap::from([
            ("artist[0]".into(), "Earth, Wind & Fire".into()),
            ("track[0]".into(), "September".into()),
            ("timestamp[0]".into(), timestamp),
            ("album[0]".into(), "The Best Of".into()),
            ("mbid[0]".into(), "recording-id".into()),
            ("duration[0]".into(), "215".into()),
        ]);
        let r = matching_request(&parse_batch(&form).unwrap()[0]);
        assert_eq!(r.artists, ["Earth, Wind & Fire"]);
        assert_eq!(r.album.as_deref(), Some("The Best Of"));
        assert_eq!(
            r.identifiers.musicbrainz_recording_id.as_deref(),
            Some("recording-id")
        );
        assert_eq!(r.duration_ms, Some(215000));
    }
    #[test]
    fn listenbrainz_keeps_release_and_recording_ids_distinct() {
        let meta = serde_json::from_value(serde_json::json!({
            "track_name": "Song", "artist_name": "Artist", "release_name": "Album",
            "additional_info": {
                "recording_mbid": "recording", "release_mbid": "release",
                "musicbrainz_track_id": "release-track-not-recording", "duration_ms": 123000,
                "isrc": "GBBPW9800019", "spotify_id": "https://open.spotify.com/track/2XQSgmtEY2titXhfY414dy"
            }
        })).unwrap();
        let r = listenbrainz_matching_request(&meta);
        assert_eq!(r.album.as_deref(), Some("Album"));
        assert_eq!(r.duration_ms, Some(123000));
        assert_eq!(
            r.identifiers.musicbrainz_recording_id.as_deref(),
            Some("recording")
        );
        assert_eq!(
            r.identifiers.musicbrainz_release_id.as_deref(),
            Some("release")
        );
        assert_eq!(
            r.identifiers.spotify_track_id.as_deref(),
            Some("2XQSgmtEY2titXhfY414dy")
        );
    }
}
