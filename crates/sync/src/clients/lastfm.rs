use std::{collections::HashMap, env};

use anyhow::Error;
use governor::{Quota, RateLimiter};
use nonzero_ext::nonzero;

use crate::types::lastfm::{recent_track::RecentTracksResponse, user::UserResponse};

pub struct LastFmClient {
    session_key: String,
    user: Option<String>,
    rate_limiter: RateLimiter<
        governor::state::direct::NotKeyed,
        governor::state::InMemoryState,
        governor::clock::DefaultClock,
    >,
}

const API_URL: &str = "https://ws.audioscrobbler.com/2.0/";

impl LastFmClient {
    pub fn new(session_key: &str) -> Self {
        let quota = Quota::per_second(nonzero!(5u32));
        let rate_limiter = RateLimiter::direct(quota);

        LastFmClient {
            session_key: session_key.to_string(),
            user: None,
            rate_limiter,
        }
    }

    pub fn set_user(&mut self, user: &str) {
        self.user = Some(user.to_string());
    }

    pub async fn get_user_info(&self) -> Result<UserResponse, Error> {
        self.rate_limiter.until_ready().await;

        let client = reqwest::Client::new();
        let response = client
            .get(API_URL)
            .query(&[
                ("method", "user.getinfo"),
                ("api_key", &env::var("LASTFM_API_KEY")?),
                ("sk", &self.session_key),
                ("format", "json"),
            ])
            .send()
            .await?;

        let data = response.json::<UserResponse>().await?;
        Ok(data)
    }

    pub async fn get_recent_tracks(
        &self,
        limit: u32,
        page: u32,
    ) -> Result<RecentTracksResponse, Error> {
        let client = reqwest::Client::new();
        let response = client
            .get(API_URL)
            .query(&[
                ("method", "user.getrecenttracks"),
                ("api_key", &env::var("LASTFM_API_KEY")?),
                ("sk", &self.session_key),
                ("format", "json"),
                ("limit", &limit.to_string()),
                ("page", &page.to_string()),
            ])
            .send()
            .await?;

        let data = response.json::<RecentTracksResponse>().await?;
        Ok(data)
    }

    pub async fn get_loved_tracks(
        &self,
        limit: u32,
        page: u32,
    ) -> Result<serde_json::Value, Error> {
        self.rate_limiter.until_ready().await;

        let client = reqwest::Client::new();
        let user = match &self.user {
            Some(u) => u.clone(),
            None => return Err(anyhow::anyhow!("User not set for LastFmClient")),
        };

        let response = client
            .get(API_URL)
            .query(&[
                ("method", "user.getlovedtracks"),
                ("api_key", &env::var("LASTFM_API_KEY")?),
                ("user", &user),
                ("format", "json"),
                ("limit", &limit.to_string()),
                ("page", &page.to_string()),
            ])
            .send()
            .await?;

        let data = response.json::<serde_json::Value>().await?;
        Ok(data)
    }
}

pub fn generate_api_sig(params: &HashMap<String, String>, api_secret: &str) -> String {
    let mut sorted_params: Vec<_> = params
        .iter()
        .filter(|(k, _)| {
            k.as_str() != "format" && k.as_str() != "api_sig" && k.as_str() != "callback"
        })
        .collect();
    sorted_params.sort_by(|a, b| a.0.cmp(b.0));

    let concat = sorted_params
        .into_iter()
        .fold(String::new(), |acc, (k, v)| acc + k + v);

    let sig_string = concat + api_secret;
    format!("{:x}", md5::compute(sig_string))
}
