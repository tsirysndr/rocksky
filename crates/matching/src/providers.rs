//! Adapters reuse the existing Spotify/Deezer/MusicBrainz service contracts.
//! Provider ranking is advisory: every returned candidate passes the Rust policy.
use crate::{Candidate, Identifiers, MatchRequest};
use anyhow::{bail, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{future::Future, pin::Pin, time::Duration};

pub type CandidateFuture<'a> = Pin<Box<dyn Future<Output = Result<Vec<Candidate>>> + Send + 'a>>;
pub trait Provider: Send + Sync {
    fn name(&self) -> &'static str;
    fn candidates<'a>(&'a self, request: &'a MatchRequest) -> CandidateFuture<'a>;
}

#[derive(Clone)]
pub struct HttpProvider {
    pub kind: ProviderKind,
    base_url: String,
    client: reqwest::Client,
    auth: Option<crate::spotify_auth::SpotifyAuth>,
}
#[derive(Clone, Copy)]
pub enum ProviderKind {
    Deezer,
    Spotify,
    Musicbrainz,
}
impl HttpProvider {
    pub fn new(kind: ProviderKind, base_url: String, token: Option<String>) -> Result<Self> {
        let url = reqwest::Url::parse(&base_url)?;
        if !matches!(url.scheme(), "http" | "https") {
            bail!("provider URL must be HTTP(S)");
        }
        Ok(Self {
            kind,
            base_url: base_url.trim_end_matches('/').into(),
            auth: token.map(crate::spotify_auth::SpotifyAuth::Static),
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(2))
                .timeout(Duration::from_secs(7))
                .build()?,
        })
    }
    pub fn with_spotify_auth(mut self, auth: crate::spotify_auth::SpotifyAuth) -> Self {
        self.auth = Some(auth);
        self
    }
    async fn spotify_get(&self, path: &str, query: &[(&str, &str)]) -> Result<Value> {
        let auth = self
            .auth
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Spotify authentication not configured"))?;
        let mut token = auth.token(&self.client).await?;
        for attempt in 0..2 {
            let response = self
                .client
                .get(format!("{}{path}", self.base_url))
                .bearer_auth(&token)
                .query(query)
                .send()
                .await?;
            if response.status() == reqwest::StatusCode::UNAUTHORIZED
                && attempt == 0
                && matches!(auth, crate::spotify_auth::SpotifyAuth::ClientCredentials(_))
            {
                auth.invalidate(&token).await;
                token = auth.token(&self.client).await?;
                continue;
            }
            return Ok(response.error_for_status()?.json().await?);
        }
        unreachable!()
    }
    async fn fetch(&self, request: &MatchRequest) -> Result<Vec<Candidate>> {
        match self.kind {
            ProviderKind::Deezer => {
                // An explicit ID can retrieve a version excluded from text-search results.
                if let Some(id) = &request.identifiers.deezer_track_id {
                    let track: Value = self
                        .client
                        .get(format!("{}/track/{id}", self.base_url))
                        .send()
                        .await?
                        .error_for_status()?
                        .json()
                        .await?;
                    return Ok(vec![Candidate {
                        source: "deezer".into(),
                        id: track["id"].to_string(),
                        title: string(&track, "title").unwrap_or_default(),
                        artists: track
                            .get("contributors")
                            .and_then(Value::as_array)
                            .filter(|a| !a.is_empty())
                            .map(|a| a.iter().filter_map(|v| string(v, "name")).collect())
                            .unwrap_or_else(|| {
                                vec![string(&track["artist"], "name").unwrap_or_default()]
                            }),
                        album: string(&track["album"], "title"),
                        duration_ms: track["duration"].as_u64().map(|d| d.saturating_mul(1000)),
                        identifiers: Identifiers {
                            deezer_track_id: track["id"].as_i64().map(|id| id.to_string()),
                            isrc: string(&track, "isrc"),
                            ..Default::default()
                        },
                        ..Default::default()
                    }]);
                }
                // Existing service owns provider caching and rate limiting.
                let response: DeezerResponse = self.client.post(format!("{}/enrich", self.base_url))
                    .json(&json!({"title": request.title, "artist": request.artists.join(", "), "album": request.album}))
                    .send().await?.error_for_status()?.json().await?;
                let mut candidates: Vec<Candidate> = response
                    .matches
                    .into_iter()
                    .map(DeezerMatch::candidate)
                    .collect();
                if let Some(track) = response.track {
                    candidates.push(track.candidate());
                }
                Ok(candidates)
            }
            ProviderKind::Spotify => {
                if let Some(id) = &request.identifiers.spotify_track_id {
                    let value = self.spotify_get(&format!("/tracks/{id}"), &[]).await?;
                    return Ok(vec![spotify_candidate(&value)]);
                }
                let q = format!(
                    "track:{} {}{}",
                    quoted(&request.title),
                    request
                        .artists
                        .iter()
                        .map(|a| format!("artist:{}", quoted(a)))
                        .collect::<Vec<_>>()
                        .join(" "),
                    request
                        .album
                        .as_ref()
                        .map(|a| format!(" album:{}", quoted(a)))
                        .unwrap_or_default()
                );
                let response = self
                    .spotify_get(
                        "/search",
                        &[("type", "track"), ("q", q.as_str()), ("limit", "10")],
                    )
                    .await?;
                let items = response["tracks"]["items"]
                    .as_array()
                    .ok_or_else(|| anyhow::anyhow!("invalid Spotify search response"))?;
                let candidates: Vec<_> = items.iter().map(spotify_candidate).collect();
                Ok(candidates)
            }
            ProviderKind::Musicbrainz => {
                if let Some(id) = &request.identifiers.musicbrainz_recording_id {
                    let value: Value = self
                        .client
                        .get(format!("{}/recording/{id}", self.base_url))
                        .send()
                        .await?
                        .error_for_status()?
                        .json()
                        .await?;
                    if let Some(actual_id) = string(&value, "trackMBID") {
                        return Ok(vec![Candidate {
                            source: "musicbrainz".into(),
                            id: actual_id.clone(),
                            title: string(&value, "name").unwrap_or_default(),
                            artists: value["artist"]
                                .as_array()
                                .map(|a| a.iter().filter_map(|v| string(v, "name")).collect())
                                .unwrap_or_default(),
                            album: string(&value, "album"),
                            duration_ms: value["durationMs"].as_u64(),
                            identifiers: Identifiers {
                                musicbrainz_recording_id: Some(actual_id),
                                musicbrainz_release_id: string(&value, "releaseMBID"),
                                isrc: string(&value, "isrc"),
                                ..Default::default()
                            },
                            ..Default::default()
                        }]);
                    }
                    return Ok(vec![]);
                }
                // /hydrate copies the requested title over the provider title.
                // Use raw /search recordings so title validation is independent.
                let values: Vec<Value> = self.client.post(format!("{}/search",self.base_url))
                    .json(&json!({"Track":request.title,"Artist":request.artists.join(", "),"Release":request.album}))
                    .send().await?.error_for_status()?.json().await?;
                let candidates: Vec<Candidate> = values
                    .iter()
                    .flat_map(|v| musicbrainz_candidates(v, request))
                    .collect();
                Ok(candidates)
            }
        }
    }
}
impl Provider for HttpProvider {
    fn name(&self) -> &'static str {
        match self.kind {
            ProviderKind::Deezer => "deezer",
            ProviderKind::Spotify => "spotify",
            ProviderKind::Musicbrainz => "musicbrainz",
        }
    }
    fn candidates<'a>(&'a self, request: &'a MatchRequest) -> CandidateFuture<'a> {
        Box::pin(self.fetch(request))
    }
}
fn quoted(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}
fn string(v: &Value, key: &str) -> Option<String> {
    v[key]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .map(str::to_owned)
}
fn spotify_candidate(v: &Value) -> Candidate {
    Candidate {
        source: "spotify".into(),
        id: string(v, "id").unwrap_or_default(),
        title: string(v, "name").unwrap_or_default(),
        artists: v["artists"]
            .as_array()
            .map(|a| a.iter().filter_map(|v| string(v, "name")).collect())
            .unwrap_or_default(),
        album: string(&v["album"], "name"),
        album_artist: v["album"]["artists"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(|a| string(a, "name")),
        album_type: string(&v["album"], "album_type"),
        duration_ms: v["duration_ms"].as_u64(),
        identifiers: Identifiers {
            spotify_track_id: string(v, "id"),
            isrc: string(&v["external_ids"], "isrc"),
            ..Default::default()
        },
        album_art: v["album"]["images"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(|v| string(v, "url")),
        release_date: string(&v["album"], "release_date"),
        ..Default::default()
    }
}
#[derive(Deserialize)]
struct DeezerResponse {
    track: Option<DeezerMatch>,
    matches: Vec<DeezerMatch>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeezerMatch {
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    deezer_track_id: Option<i64>,
    title: String,
    artist: String,
    album: String,
    album_art: Option<String>,
    duration_ms: Option<u64>,
    isrc: Option<String>,
}
impl DeezerMatch {
    fn candidate(self) -> Candidate {
        let id = self
            .deezer_track_id
            .or(self.id)
            .filter(|id| *id > 0)
            .map(|id| id.to_string());
        Candidate {
            source: "deezer".into(),
            id: id.clone().unwrap_or_default(),
            title: self.title,
            artists: vec![self.artist],
            album: Some(self.album),
            album_art: self.album_art,
            duration_ms: self.duration_ms,
            identifiers: Identifiers {
                deezer_track_id: id,
                isrc: self.isrc.filter(|s| !s.is_empty()),
                ..Default::default()
            },
            ..Default::default()
        }
    }
}

fn musicbrainz_candidates(v: &Value, request: &MatchRequest) -> Vec<Candidate> {
    let base = Candidate {
        source: "musicbrainz".into(),
        id: string(v, "id").unwrap_or_default(),
        title: string(v, "title").unwrap_or_default(),
        artists: v["artist-credit"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| string(v, "name").or_else(|| string(&v["artist"], "name")))
                    .collect()
            })
            .unwrap_or_default(),
        duration_ms: v["length"].as_u64(),
        version: string(v, "disambiguation"),
        identifiers: Identifiers {
            musicbrainz_recording_id: string(v, "id"),
            isrc: v["isrcs"]
                .as_array()
                .and_then(|ids| {
                    ids.iter()
                        .filter_map(Value::as_str)
                        .find(|id| {
                            request.identifiers.isrc.as_deref().is_some_and(|wanted| {
                                wanted
                                    .replace('-', "")
                                    .eq_ignore_ascii_case(&id.replace('-', ""))
                            })
                        })
                        .or_else(|| ids.first().and_then(Value::as_str))
                })
                .map(str::to_owned),
            ..Default::default()
        },
        ..Default::default()
    };
    let Some(releases) = v["releases"].as_array().filter(|r| !r.is_empty()) else {
        return vec![base];
    };
    releases
        .iter()
        .map(|release| {
            let mut candidate = base.clone();
            candidate.album = string(release, "title");
            candidate.version = Some(format!(
                "{} {}",
                candidate.version.as_deref().unwrap_or(""),
                string(release, "disambiguation").unwrap_or_default()
            ));
            candidate.identifiers.musicbrainz_release_id = string(release, "id");
            candidate.id = format!(
                "{}:{}",
                candidate.id,
                candidate
                    .identifiers
                    .musicbrainz_release_id
                    .as_deref()
                    .unwrap_or("unknown")
            );
            candidate.release_status = string(release, "status").map(|s| s.to_lowercase());
            candidate.country = string(release, "country");
            candidate.release_date = string(release, "date");
            candidate.album_type =
                string(&release["release-group"], "primary-type").map(|s| s.to_lowercase());
            if release["track-count"].as_u64() == Some(1) {
                candidate.album_type = Some("single".into());
            }
            candidate
        })
        .collect()
}
