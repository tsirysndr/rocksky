use super::types::{Album, Artist, SearchResponse};
use anyhow::Error;
use std::{env, time::Duration};

pub const DEFAULT_BASE_URL: &str = "https://api.spotify.com/v1";

pub fn base_url() -> String {
    env::var("SPOTIFY_API_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string())
}

pub struct SpotifyClient {
    token: String,
    client: reqwest::Client,
}

impl SpotifyClient {
    pub fn new(token: &str) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .expect("Failed to build HTTP client");

        SpotifyClient {
            token: token.to_string(),
            client,
        }
    }

    pub async fn search(&self, query: &str) -> Result<SearchResponse, Error> {
        let url = format!("{}/search", base_url());
        let response = self
            .client
            .get(&url)
            .bearer_auth(&self.token)
            .query(&[("type", "track"), ("q", query)])
            .send()
            .await?;
        let result = response.json().await?;
        Ok(result)
    }

    pub async fn get_album(&self, id: &str) -> Result<Option<Album>, Error> {
        let url = format!("{}/albums/{}", base_url(), id);
        let response = self
            .client
            .get(&url)
            .bearer_auth(&self.token)
            .send()
            .await?;

        let headers = response.headers().clone();
        let data = response.text().await?;

        if data == "Too many requests" {
            tracing::info!(retry_after = %headers.get("retry-after").unwrap().to_str().unwrap(), data = %data, "Rate limited on get_album");
            return Ok(None);
        }

        Ok(Some(serde_json::from_str(&data)?))
    }

    pub async fn get_artist(&self, id: &str) -> Result<Option<Artist>, Error> {
        let url = format!("{}/artists/{}", base_url(), id);
        let response = self
            .client
            .get(&url)
            .bearer_auth(&self.token)
            .send()
            .await?;

        let headers = response.headers().clone();
        let data = response.text().await?;

        if data == "Too many requests" {
            tracing::info!(retry_after = %headers.get("retry-after").unwrap().to_str().unwrap(), data = %data, "Rate limited on get_artist");
            return Ok(None);
        }

        Ok(Some(serde_json::from_str(&data)?))
    }
}
