use std::{env, time::Duration};

use anyhow::{Context, Error};
use serde::{Deserialize, Serialize};

/// Default location of the Rocksky Deezer enrichment service (the `deezer/` Go
/// microservice). Overridable via the `DEEZER_URL` environment variable.
pub const DEFAULT_BASE_URL: &str = "http://localhost:8090";

const REQUEST_TIMEOUT_SECS: u64 = 10;

/// Thin HTTP client for the Rocksky Deezer enrichment service. The service
/// itself owns rate limiting (50 req / 5 s) and TTL caching, so this client is
/// intentionally stateless and cheap to construct.
#[derive(Clone)]
pub struct DeezerClient {
    http: reqwest::Client,
    base_url: String,
}

#[derive(Debug, Serialize)]
struct EnrichRequest<'a> {
    title: &'a str,
    artist: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    album: Option<&'a str>,
}

/// Response of `POST /enrich`: the best enriched track (absent when nothing
/// matched) plus a ranked list of candidate matches.
#[derive(Debug, Deserialize, Default)]
pub struct EnrichResponse {
    pub track: Option<EnrichedTrack>,
    #[serde(default)]
    pub matches: Vec<Match>,
}

/// Fully hydrated, normalized track metadata. Durations are milliseconds.
#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct EnrichedTrack {
    pub title: String,
    pub artist: String,
    pub album_artist: Option<String>,
    pub album: String,
    pub album_art: Option<String>,
    pub isrc: Option<String>,
    pub upc: Option<String>,
    #[serde(default)]
    pub duration_ms: u64,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub release_date: Option<String>,
    pub year: Option<u32>,
    pub label: Option<String>,
    pub genres: Option<Vec<String>>,
    pub artist_picture: Option<String>,
    pub deezer_link: Option<String>,
    pub preview: Option<String>,
    #[serde(default)]
    pub explicit: bool,
    #[serde(default)]
    pub deezer_track_id: i64,
    #[serde(default)]
    pub deezer_album_id: i64,
    #[serde(default)]
    pub deezer_artist_id: i64,
}

/// A ranked candidate match. Duration is milliseconds; score is in [0,1].
#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Match {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art: Option<String>,
    pub isrc: Option<String>,
    #[serde(default)]
    pub duration_ms: u64,
    pub link: Option<String>,
    pub preview: Option<String>,
    #[serde(default)]
    pub rank: i64,
    #[serde(default)]
    pub explicit: bool,
    #[serde(default)]
    pub score: f64,
}

impl DeezerClient {
    /// Builds a client pointed at `DEEZER_URL` (or the default localhost port).
    pub fn from_env() -> Result<Self, Error> {
        let base_url = env::var("DEEZER_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());
        Self::new(base_url)
    }

    pub fn new(base_url: impl Into<String>) -> Result<Self, Error> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .context("build deezer http client")?;
        Ok(DeezerClient {
            http,
            base_url: base_url.into().trim_end_matches('/').to_string(),
        })
    }

    /// Asks the enrichment service for the best canonical track metadata plus a
    /// ranked list of candidate matches for the given title/artist/album.
    pub async fn enrich(
        &self,
        title: &str,
        artist: &str,
        album: Option<&str>,
    ) -> Result<EnrichResponse, Error> {
        let url = format!("{}/enrich", self.base_url);
        let album = album.map(str::trim).filter(|a| !a.is_empty());

        let resp = self
            .http
            .post(&url)
            .json(&EnrichRequest {
                title,
                artist,
                album,
            })
            .send()
            .await
            .context("send deezer enrich request")?
            .error_for_status()
            .context("deezer enrich returned error status")?;

        let body = resp
            .json::<EnrichResponse>()
            .await
            .context("decode deezer enrich response")?;
        Ok(body)
    }
}
