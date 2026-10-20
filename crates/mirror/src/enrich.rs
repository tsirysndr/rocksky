//! Best-effort enrichment from the centralized matching service.
//! Source metadata survives misses, ambiguity, and service outages unchanged.
use crate::track::NormalizedTrack;
use reqwest::Client;
use rocksky_db::Backend;
use rocksky_matching::{
    client::{spotify_track_id, MatchingClient},
    Identifiers, MatchRequest,
};

#[derive(Clone)]
pub struct Enricher {
    matcher: MatchingClient,
}

impl Enricher {
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self {
            matcher: MatchingClient::from_env()?,
        })
    }
    pub async fn enrich(&self, _pool: &Backend, _http: &Client, track: &mut NormalizedTrack) {
        let request = matching_request(track);
        match self.matcher.match_track(&request).await {
            Ok(Some(c)) => {
                // Only fill missing metadata from the selected recording/release.
                if track.album.trim().is_empty() {
                    if let Some(album) = c.album {
                        track.album = album;
                    }
                }
                if track.album_artist.trim().is_empty() {
                    if let Some(album_artist) = c.album_artist {
                        track.album_artist = album_artist;
                    }
                }
                track.album_art = track.album_art.take().or(c.album_art);
                track.isrc = track.isrc.take().or(c.identifiers.isrc);
                track.mb_id = track
                    .mb_id
                    .take()
                    .or(c.identifiers.musicbrainz_recording_id);
                track.spotify_link = track.spotify_link.take().or(c.spotify_link).or_else(|| {
                    c.identifiers
                        .spotify_track_id
                        .map(|id| format!("https://open.spotify.com/track/{id}"))
                });
                track.track_number = track
                    .track_number
                    .or(c.track_number.and_then(|n| n.try_into().ok()));
                track.disc_number = track
                    .disc_number
                    .or(c.disc_number.and_then(|n| n.try_into().ok()));
                if track.duration <= 0 {
                    track.duration = c
                        .duration_ms
                        .and_then(|n| n.try_into().ok())
                        .unwrap_or_default();
                }
            }
            Ok(None) => {
                tracing::info!(title = %track.title, "No unambiguous match; retaining mirror metadata")
            }
            Err(error) => tracing::warn!(%error, "Matching unavailable; retaining mirror metadata"),
        }
    }
}

pub fn matching_request(track: &NormalizedTrack) -> MatchRequest {
    MatchRequest {
        title: track.title.clone(),
        artists: vec![track.artist.clone()],
        album: Some(track.album.clone()).filter(|s| !s.trim().is_empty()),
        album_artist: Some(track.album_artist.clone()).filter(|s| !s.trim().is_empty()),
        duration_ms: u64::try_from(track.duration).ok().filter(|n| *n > 0),
        identifiers: Identifiers {
            musicbrainz_recording_id: track.mb_id.clone(),
            isrc: track.isrc.clone(),
            spotify_track_id: track.spotify_link.as_deref().and_then(spotify_track_id),
            ..Default::default()
        },
    }
}
