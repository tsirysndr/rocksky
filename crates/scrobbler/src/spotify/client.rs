use super::types::SearchResponse;
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
        let response = client.get(&url)
        .bearer_auth(&self.token)
        .query(&[
          ("type", "track"),
          ("q", query),
          ])
        .send().await?;
        let result = response.json().await?;
        Ok(result)
    }
}
