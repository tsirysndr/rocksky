use super::types::{Album, Artist, SearchResponse};
use anyhow::Error;

pub const BASE_URL: &str = "https://api.spotify.com/v1";

pub struct SpotifyClient {
    token: String,
}

impl SpotifyClient {
    pub fn new(token: &str) -> Self {
        SpotifyClient {
            token: token.to_string(),
        }
    }

    pub async fn search(&self, query: &str) -> Result<SearchResponse, Error> {
        let url = format!("{}/search", BASE_URL);
        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .bearer_auth(&self.token)
            .query(&[("type", "track"), ("q", query)])
            .send()
            .await?;
        let result = response.json().await?;
        Ok(result)
    }

    pub async fn get_album(&self, id: &str) -> Result<Option<Album>, Error> {
        let url = format!("{}/albums/{}", BASE_URL, id);
        let client = reqwest::Client::new();
        let response = client.get(&url).bearer_auth(&self.token).send().await?;

        let headers = response.headers().clone();
        let data = response.text().await?;

        if data == "Too many requests" {
            tracing::info!(retry_after = %headers.get("retry-after").unwrap().to_str().unwrap(), data = %data, "Rate limited on get_album");
            return Ok(None);
        }

        Ok(Some(serde_json::from_str(&data)?))
    }

    pub async fn get_artist(&self, id: &str) -> Result<Option<Artist>, Error> {
        let url = format!("{}/artists/{}", BASE_URL, id);
        let client = reqwest::Client::new();
        let response = client.get(&url).bearer_auth(&self.token).send().await?;

        let headers = response.headers().clone();
        let data = response.text().await?;

        if data == "Too many requests" {
            tracing::info!(retry_after = %headers.get("retry-after").unwrap().to_str().unwrap(), data = %data, "Rate limited on get_artist");
            return Ok(None);
        }

        Ok(Some(serde_json::from_str(&data)?))
    }
}
