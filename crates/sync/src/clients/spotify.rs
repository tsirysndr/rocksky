use anyhow::Error;
use reqwest::Client;
use serde::Deserialize;
use std::env;

use crate::types::spotify::track::SavedTracks;

#[derive(Debug, Deserialize)]
pub struct AccessToken {
    pub access_token: String,
    pub token_type: String,
    pub scope: String,
    pub expires_in: u32,
}

pub struct SpotifyClient {
    refresh_token: String,
    access_token: Option<String>,
}

impl SpotifyClient {
    pub fn new(refresh_token: &str) -> Self {
        SpotifyClient {
            refresh_token: refresh_token.to_string(),
            access_token: None,
        }
    }

    pub async fn get_access_token(&mut self) -> Result<AccessToken, Error> {
        if env::var("SPOTIFY_CLIENT_ID").is_err() || env::var("SPOTIFY_CLIENT_SECRET").is_err() {
            panic!("Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables");
        }

        let client_id = env::var("SPOTIFY_CLIENT_ID")?;
        let client_secret = env::var("SPOTIFY_CLIENT_SECRET")?;

        let client = Client::new();

        let response = client
            .post("https://accounts.spotify.com/api/token")
            .basic_auth(&client_id, Some(client_secret))
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", &self.refresh_token),
                ("client_id", &client_id),
            ])
            .send()
            .await?;
        let token = response.json::<AccessToken>().await?;
        self.access_token = Some(token.access_token.clone());

        Ok(token)
    }

    pub async fn get_user_saved_tracks(
        &self,
        offset: usize,
        limit: usize,
        market: Option<&str>,
    ) -> Result<SavedTracks, Error> {
        let client = Client::new();
        let url = "https://api.spotify.com/v1/me/tracks";
        let mut params = vec![("offset", offset.to_string()), ("limit", limit.to_string())];

        if let Some(market) = market {
            params.extend(vec![("market", market.to_string())]);
        }

        let response = client
            .get(url)
            .query(&params)
            .bearer_auth(self.access_token.as_ref().unwrap())
            .send()
            .await?;
        let tracks = response.json::<SavedTracks>().await?;
        Ok(tracks)
    }
}
