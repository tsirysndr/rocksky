//! Shared HTTP client. Unmatched/ambiguous are results; transport failures are errors.
use crate::{Candidate, MatchRequest, MatchResponse, Status};
use std::time::Duration;
#[derive(Clone)]
pub struct MatchingClient {
    http: reqwest::Client,
    endpoint: String,
}
impl MatchingClient {
    pub fn from_env() -> anyhow::Result<Self> {
        Self::new(&std::env::var("MATCHING_URL").unwrap_or_else(|_| "http://127.0.0.1:8097".into()))
    }

    /// Never pick a candidate locally or turn a transport failure into a miss.
    pub async fn match_track(&self, request: &MatchRequest) -> anyhow::Result<Option<Candidate>> {
        let response = self.resolve(request).await?;
        for warning in &response.warnings {
            tracing::warn!(%warning, "Matching provider warning");
        }
        if response.status == Status::Matched {
            anyhow::ensure!(response.track.is_some(), "matched response has no track");
            Ok(response.track)
        } else {
            anyhow::ensure!(
                response.track.is_none(),
                "non-matched response has a selected track"
            );
            Ok(None)
        }
    }

    pub fn new(base_url: &str) -> anyhow::Result<Self> {
        let url = reqwest::Url::parse(base_url)?;
        anyhow::ensure!(
            matches!(url.scheme(), "http" | "https"),
            "matching URL must be HTTP(S)"
        );
        Ok(Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()?,
            endpoint: format!("{}/v1/match", base_url.trim_end_matches('/')),
        })
    }
    pub async fn resolve(&self, request: &MatchRequest) -> anyhow::Result<MatchResponse> {
        request.validate().map_err(anyhow::Error::msg)?;
        Ok(self
            .http
            .post(&self.endpoint)
            .json(request)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }
}

/// Extract a supplied Spotify track identifier; never interpret another provider's ID.
pub fn spotify_track_id(value: &str) -> Option<String> {
    let raw = value.trim();
    let id = if let Some(id) = raw.strip_prefix("spotify:track:") {
        id.to_owned()
    } else if let Ok(url) = reqwest::Url::parse(raw) {
        if url.host_str() != Some("open.spotify.com") {
            return None;
        }
        let parts: Vec<_> = url.path_segments()?.collect();
        if parts.len() != 2 || parts[0] != "track" {
            return None;
        }
        parts[1].to_owned()
    } else {
        raw.to_owned()
    };
    (id.len() == 22 && id.chars().all(|c| c.is_ascii_alphanumeric())).then_some(id)
}
