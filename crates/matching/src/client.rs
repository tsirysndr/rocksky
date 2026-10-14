//! Shared HTTP client. Unmatched/ambiguous are results; transport failures are errors.
use crate::{MatchRequest, MatchResponse};
use std::time::Duration;
#[derive(Clone)]
pub struct MatchingClient {
    http: reqwest::Client,
    endpoint: String,
}
impl MatchingClient {
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
