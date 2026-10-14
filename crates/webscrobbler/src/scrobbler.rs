use crate::{
    cache::Cache,
    rocksky,
    types::{ScrobbleRequest, Song, Track},
};
use anyhow::Error;
use rocksky_db::Backend;
use rocksky_matching::{
    client::{spotify_track_id, MatchingClient},
    Identifiers, MatchRequest,
};

fn optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

pub fn matching_request(song: &Song) -> MatchRequest {
    let parsed = &song.parsed;
    let mut identifiers = Identifiers::default();
    // A connector's opaque uniqueID is only meaningful within that provider.
    match song.connector.id.as_str() {
        "spotify" => {
            identifiers.spotify_track_id = parsed
                .unique_id
                .as_deref()
                .or(song.metadata.track_url.as_deref())
                .and_then(spotify_track_id)
        }
        "deezer" => {
            identifiers.deezer_track_id = parsed
                .unique_id
                .clone()
                .filter(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()))
        }
        _ => {}
    }
    MatchRequest {
        title: parsed.track.clone(),
        artists: vec![parsed.artist.clone()],
        album: optional(parsed.album.as_deref()),
        album_artist: optional(parsed.album_artist.as_deref()),
        duration_ms: parsed
            .duration
            .filter(|n| *n > 0)
            .map(|n| u64::from(n) * 1000),
        identifiers,
    }
}

pub async fn resolve_track(matcher: &MatchingClient, song: &Song) -> Result<Option<Track>, Error> {
    Ok(matcher
        .match_track(&matching_request(song))
        .await?
        .map(Into::into))
}

pub async fn scrobble(
    _pool: &Backend,
    cache: &Cache,
    matcher: &MatchingClient,
    scrobble: ScrobbleRequest,
    did: &str,
) -> Result<(), Error> {
    if let Some(track) = resolve_track(matcher, &scrobble.data.song).await? {
        rocksky::scrobble(cache, did, track, scrobble.time).await?;
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    } else {
        tracing::warn!("No unambiguous match; skipping scrobble");
    }
    Ok(())
}

#[cfg(test)]
mod matching_tests {
    use super::*;
    fn song(connector: &str, id: &str) -> Song {
        serde_json::from_value(serde_json::json!({
            "connector": {"id": connector, "js": "test.js", "label": "Test", "matches": []},
            "controllerTabId": 1,
            "flags": {"finishedProcessing": true, "hasBlockedTag": false, "isAlbumFetched": true,
                "isCorrectedByUser": false, "isMarkedAsPlaying": true, "isRegexEditedByUser": {
                    "album": false, "albumArtist": false, "artist": false, "track": false},
                "isReplaying": false, "isScrobbled": false, "isSkipped": false, "isValid": true},
            "metadata": {"label": "Test", "startTimestamp": 1},
            "noRegex": {"artist": "Earth, Wind & Fire", "track": "September"},
            "parsed": {"artist": "Earth, Wind & Fire", "track": "September", "album": "Album",
                "albumArtist": "Earth, Wind & Fire", "duration": 215, "uniqueID": id,
                "isPlaying": true, "isPodcast": false}
        }))
        .unwrap()
    }
    #[test]
    fn spotify_preserves_explicit_id_album_and_duration() {
        let r = matching_request(&song("spotify", "spotify:track:2XQSgmtEY2titXhfY414dy"));
        assert_eq!(
            r.identifiers.spotify_track_id.as_deref(),
            Some("2XQSgmtEY2titXhfY414dy")
        );
        assert_eq!(r.album.as_deref(), Some("Album"));
        assert_eq!(r.artists, ["Earth, Wind & Fire"]);
        assert_eq!(r.duration_ms, Some(215000));
    }
    #[test]
    fn connector_ids_are_not_interchangeable() {
        assert_eq!(
            matching_request(&song("deezer", "29373661"))
                .identifiers
                .deezer_track_id
                .as_deref(),
            Some("29373661")
        );
        assert_eq!(
            matching_request(&song("tidal", "29373661")).identifiers,
            Identifiers::default()
        );
        assert_eq!(
            matching_request(&song("youtube", "2XQSgmtEY2titXhfY414dy")).identifiers,
            Identifiers::default()
        );
    }
}
