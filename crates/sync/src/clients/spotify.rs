use anyhow::Error;
use rand::Rng;
use reqwest::Client;
use serde::Deserialize;
use sqlx::{Pool, Postgres};
use std::env;

use crate::{
    crypto::decrypt_aes_256_ctr,
    repo,
    types::spotify::{
        album::Album,
        artist::Artist,
        track::{SavedTracks, SearchResponse},
    },
};

const BASE_URL: &str = "https://api.spotify.com/v1";

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

    pub async fn new_with_token(pool: &Pool<Postgres>) -> Result<Self, Error> {
        let spofity_tokens = repo::spotify_token::get_spotify_tokens(pool, 100).await?;

        if spofity_tokens.is_empty() {
            return Err(anyhow::anyhow!("No Spotify tokens found"));
        }

        // we need to pick a random token to avoid Spotify rate limiting
        // and to avoid using the same token for all scrobbles
        // this is a simple way to do it, but we can improve it later
        // by using a more sophisticated algorithm
        // or by using a token pool
        let mut rng = rand::rng();
        let random_index = rng.random_range(0..spofity_tokens.len());
        let spotify_token = &spofity_tokens[random_index];

        let refresh_token = decrypt_aes_256_ctr(
            &spotify_token.refresh_token,
            &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
        )?;

        Ok(SpotifyClient {
            refresh_token,
            access_token: None,
        })
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
        let url = &format!("{}/me/tracks", BASE_URL);
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

    pub async fn search_track(&self, query: &str) -> Result<SearchResponse, Error> {
        let client = Client::new();
        let url = &format!("{}/search", BASE_URL);
        let params = [("q", query.to_string()), ("type", "track".to_string())];

        let response = client
            .get(url)
            .query(&params)
            .bearer_auth(self.access_token.as_ref().unwrap())
            .send()
            .await?;

        let headers = response.headers().clone();
        let data = response.text().await?;

        if data == "Too many requests" {
            tracing::info!(retry_after = %headers.get("retry-after").unwrap().to_str().unwrap(), data = %data, "Rate limited on search_track");
            return Err(anyhow::anyhow!("Rate limited on search_track"));
        }

        let results = serde_json::from_str::<SearchResponse>(&data)?;
        Ok(results)
    }

    pub async fn get_artist(&self, id: &str) -> Result<Option<Artist>, Error> {
        let url = format!("{}/artists/{}", BASE_URL, id);
        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .bearer_auth(self.access_token.as_ref().unwrap())
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

    pub async fn get_album(&self, id: &str) -> Result<Option<Album>, Error> {
        let url = format!("{}/albums/{}", BASE_URL, id);
        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .bearer_auth(self.access_token.as_ref().unwrap())
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
}
