//! Best-effort enrichment of the normalized track with `album_art`,
//! `spotify_link`, and `lastfm_link`.
//!
//! Order of operations:
//!   1. Look up the track in the `tracks` table by sha256(lowercase("title -
//!      artist - album")) — the same key the API computes when persisting.
//!      A hit gives us cached `album_art` + `spotify_link` for free.
//!   2. Fall back to external APIs for fields the DB couldn't fill. Both the
//!      Spotify Search and Last.fm `track.getInfo` calls draw a random
//!      credential from [`crate::creds::CredentialPool`] on each call to
//!      spread load across multiple API keys.
//!   3. `lastfm_link` isn't a column on `tracks`, so it always needs the
//!      Last.fm API.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Error};
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::Deserialize;
use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;
use tracing::{info, warn};

use crate::creds::{CredentialPool, SpotifyCred};
use crate::db;
use crate::track::NormalizedTrack;

const SPOTIFY_TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const SPOTIFY_SEARCH_URL: &str = "https://api.spotify.com/v1/search";
const LASTFM_ENDPOINT: &str = "https://ws.audioscrobbler.com/2.0/";

#[derive(Clone)]
pub struct Enricher {
    creds: CredentialPool,
    // Per-client_id Spotify access-token cache. Each client_id has its own
    // bearer token, so rotating across many client_ids means we may hold
    // several warm tokens at once. Keep them indexed by client_id.
    spotify_tokens: Arc<Mutex<HashMap<String, (String, DateTime<Utc>)>>>,
}

impl Enricher {
    pub fn new(creds: CredentialPool) -> Self {
        Self {
            creds,
            spotify_tokens: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Mutate `track` in place. Logs and swallows failures — enrichment is
    /// strictly best-effort and must never block a scrobble.
    pub async fn enrich(&self, pool: &Pool<Postgres>, http: &Client, track: &mut NormalizedTrack) {
        // 1. Rocksky DB lookup first.
        if track.album_art.is_none() || track.spotify_link.is_none() || track.isrc.is_none() {
            match db::track_enrichment(pool, &track.title, &track.artist, &track.album).await {
                Ok(Some(found)) => {
                    let mut from_db = 0;
                    if track.album_art.is_none() {
                        if let Some(a) = found.album_art {
                            track.album_art = Some(a);
                            from_db += 1;
                        }
                    }
                    if track.spotify_link.is_none() {
                        if let Some(s) = found.spotify_link {
                            track.spotify_link = Some(s);
                            from_db += 1;
                        }
                    }
                    if track.isrc.is_none() {
                        if let Some(i) = found.isrc {
                            track.isrc = Some(i);
                            from_db += 1;
                        }
                    }
                    if from_db > 0 {
                        info!(
                            title = %track.title,
                            artist = %track.artist,
                            fields = from_db,
                            "enrich: hit Rocksky tracks DB"
                        );
                    }
                }
                Ok(None) => {}
                Err(e) => warn!(error = %e, "enrich: DB lookup failed"),
            }
        }

        // 2. Spotify is the canonical metadata source — its album_art is
        //    high-resolution and its ISRC / spotify_link uniquely identify
        //    the recording. Always attempt the lookup and let it override
        //    whatever Last.fm/Teal.fm/the DB cache provided.
        match self.enrich_via_spotify(http, track).await {
            Ok(true) => info!(
                title = %track.title,
                artist = %track.artist,
                "enrich: Spotify search hit (overrode source metadata)"
            ),
            Ok(false) => info!(
                title = %track.title,
                artist = %track.artist,
                "enrich: Spotify search miss / no creds"
            ),
            Err(e) => warn!(error = %e, "enrich: Spotify lookup failed"),
        }

        if track.lastfm_link.is_none() {
            match self.enrich_via_lastfm(http, track).await {
                Ok(true) => info!(
                    title = %track.title,
                    artist = %track.artist,
                    "enrich: Last.fm getInfo hit"
                ),
                Ok(false) => info!(
                    title = %track.title,
                    artist = %track.artist,
                    "enrich: Last.fm getInfo miss / no creds"
                ),
                Err(e) => warn!(error = %e, "enrich: Last.fm lookup failed"),
            }
        }
    }

    async fn enrich_via_spotify(
        &self,
        http: &Client,
        track: &mut NormalizedTrack,
    ) -> Result<bool, Error> {
        let Some(cred) = self.creds.random_spotify().await else {
            return Ok(false);
        };
        let token = self.spotify_token(http, &cred).await?;

        let mut q = format!(
            "track:\"{}\" artist:\"{}\"",
            escape_quotes(&track.title),
            escape_quotes(&track.artist)
        );
        if !track.album.is_empty() {
            q.push_str(&format!(" album:\"{}\"", escape_quotes(&track.album)));
        }

        let resp: SearchResponse = http
            .get(SPOTIFY_SEARCH_URL)
            .bearer_auth(&token)
            .query(&[("q", q.as_str()), ("type", "track"), ("limit", "1")])
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        let Some(item) = resp.tracks.items.into_iter().next() else {
            return Ok(false);
        };

        // Override — Spotify wins over Last.fm / Teal.fm / the DB cache.
        //
        // Note: title / artist / album_artist are part of the API's sha256
        // dedup key. We deliberately override them here AFTER our own mirror
        // dedup pass has run (which already used the source's title/artist
        // and the MBID), so the values we send to createScrobble line up
        // with whatever existing Spotify-origin row the user already has.
        if !item.name.trim().is_empty() {
            track.title = item.name;
        }
        let joined_artists = item
            .artists
            .iter()
            .map(|a| a.name.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        if !joined_artists.trim().is_empty() {
            track.artist = joined_artists;
        }
        if let Some(album_artist) = item
            .album
            .artists
            .first()
            .map(|a| a.name.clone())
            .filter(|n| !n.trim().is_empty())
        {
            track.album_artist = album_artist;
        }

        if let Some(img) = item.album.images.into_iter().next() {
            track.album_art = Some(img.url);
        }
        if let Some(link) = item.external_urls.spotify {
            track.spotify_link = Some(link);
        }
        if let Some(ids) = item.external_ids {
            if let Some(isrc) = ids.isrc.filter(|s| !s.is_empty()) {
                track.isrc = Some(isrc);
            }
        }
        Ok(true)
    }

    async fn enrich_via_lastfm(
        &self,
        http: &Client,
        track: &mut NormalizedTrack,
    ) -> Result<bool, Error> {
        let Some(api_key) = self.creds.random_lastfm().await else {
            return Ok(false);
        };

        let resp = http
            .get(LASTFM_ENDPOINT)
            .query(&[
                ("method", "track.getInfo"),
                ("artist", track.artist.as_str()),
                ("track", track.title.as_str()),
                ("api_key", api_key.as_str()),
                ("format", "json"),
                ("autocorrect", "1"),
            ])
            .send()
            .await?;
        if !resp.status().is_success() {
            return Ok(false);
        }
        let body: GetInfoResponse = resp.json().await?;
        let Some(t) = body.track else {
            return Ok(false);
        };

        let mut changed = false;
        if track.lastfm_link.is_none() {
            if let Some(url) = nonempty(t.url) {
                track.lastfm_link = Some(url);
                changed = true;
            }
        }
        if track.album_art.is_none() {
            if let Some(album) = t.album {
                if let Some(img) = largest_lastfm_image(album.image) {
                    track.album_art = Some(img);
                    changed = true;
                }
            }
        }
        Ok(changed)
    }

    /// Returns a cached Spotify Bearer token for `cred.client_id`, refreshing
    /// it ~30s before expiry. Each client_id is independently cached.
    async fn spotify_token(&self, http: &Client, cred: &SpotifyCred) -> Result<String, Error> {
        let now = Utc::now();
        {
            let guard = self.spotify_tokens.lock().await;
            if let Some((tok, exp)) = guard.get(&cred.client_id) {
                if *exp - now > chrono::Duration::seconds(30) {
                    return Ok(tok.clone());
                }
            }
        }

        let basic = STANDARD.encode(format!("{}:{}", cred.client_id, cred.client_secret));
        let resp: TokenResponse = http
            .post(SPOTIFY_TOKEN_URL)
            .header("Authorization", format!("Basic {basic}"))
            .form(&[("grant_type", "client_credentials")])
            .timeout(Duration::from_secs(10))
            .send()
            .await
            .context("Spotify token request failed")?
            .error_for_status()
            .context("Spotify token request returned non-success")?
            .json()
            .await?;

        let exp = now + chrono::Duration::seconds(resp.expires_in.max(60));
        let mut guard = self.spotify_tokens.lock().await;
        guard.insert(cred.client_id.clone(), (resp.access_token.clone(), exp));
        Ok(resp.access_token)
    }
}

fn escape_quotes(s: &str) -> String {
    s.replace('"', "")
}

fn nonempty(s: Option<String>) -> Option<String> {
    s.filter(|v| !v.trim().is_empty())
}

fn largest_lastfm_image(images: Option<Vec<LastfmImage>>) -> Option<String> {
    images?.into_iter().rev().find_map(|i| nonempty(i.text))
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: i64,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    tracks: SearchTracks,
}

#[derive(Debug, Deserialize)]
struct SearchTracks {
    items: Vec<SearchTrackItem>,
}

#[derive(Debug, Deserialize)]
struct SearchTrackItem {
    name: String,
    artists: Vec<SpotifyArtistRef>,
    album: SearchAlbum,
    external_urls: ExternalUrls,
    #[serde(default)]
    external_ids: Option<SpotifyExternalIds>,
}

#[derive(Debug, Deserialize)]
struct SpotifyArtistRef {
    name: String,
}

#[derive(Debug, Default, Deserialize)]
struct SpotifyExternalIds {
    #[serde(default)]
    isrc: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchAlbum {
    #[serde(default)]
    artists: Vec<SpotifyArtistRef>,
    images: Vec<AlbumImage>,
}

#[derive(Debug, Deserialize)]
struct AlbumImage {
    url: String,
}

#[derive(Debug, Default, Deserialize)]
struct ExternalUrls {
    spotify: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GetInfoResponse {
    track: Option<LastfmTrack>,
}

#[derive(Debug, Deserialize)]
struct LastfmTrack {
    url: Option<String>,
    album: Option<LastfmAlbum>,
}

#[derive(Debug, Deserialize)]
struct LastfmAlbum {
    image: Option<Vec<LastfmImage>>,
}

#[derive(Debug, Deserialize)]
struct LastfmImage {
    #[serde(rename = "#text")]
    text: Option<String>,
}
