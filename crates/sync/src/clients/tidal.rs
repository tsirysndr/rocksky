use std::env;

use anyhow::Error;
use reqwest::Client;
use serde::Deserialize;

use crate::types::tidal::{
    album::AlbumResponse,
    artist::ArtistResponse,
    track::{TrackResponse, TracksCollectionResponse, TracksResponse},
};

const BASE_URL: &str = "https://openapi.tidal.com/v2";

#[derive(Debug, Deserialize)]
pub struct AccessToken {
    pub access_token: String,
    pub expires_in: u32,
    pub scope: String,
    pub token_type: String,
    pub user_id: u64,
}

pub struct TidalClient {
    refresh_token: String,
    access_token: Option<String>,
    user_id: Option<u64>,
}

impl TidalClient {
    pub fn new(refresh_token: &str) -> Self {
        TidalClient {
            refresh_token: refresh_token.to_string(),
            access_token: None,
            user_id: None,
        }
    }

    pub async fn get_access_token(&mut self) -> Result<AccessToken, Error> {
        let client_id =
            env::var("TIDAL_CLIENT_ID").expect("Please set TIDAL_CLIENT_ID environment variable");
        let client = Client::new();
        let response = client
            .post("https://auth.tidal.com/v1/oauth2/token")
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", &self.refresh_token),
                ("client_id", &client_id),
            ])
            .send()
            .await?;

        let access_token = response.json::<AccessToken>().await?;
        self.access_token = Some(access_token.access_token.clone());
        self.user_id = Some(access_token.user_id);

        Ok(access_token)
    }

    pub async fn get_user_tracks(&self) -> Result<TracksCollectionResponse, Error> {
        if self.access_token.is_none() {
            return Err(anyhow::anyhow!(
                "Access token is not set. Please call get_access_token() first."
            ));
        }
        let client = Client::builder()
            .default_headers({
                let mut headers = reqwest::header::HeaderMap::new();
                headers.insert(
                    reqwest::header::AUTHORIZATION,
                    format!("Bearer {}", self.access_token.as_ref().unwrap())
                        .parse()
                        .unwrap(),
                );
                headers.insert(
                    reqwest::header::ACCEPT,
                    "application/vnd.api+json".parse().unwrap(),
                );
                headers
            })
            .build()?;
        let url = format!(
            "{}/userCollections/{}/relationships/tracks",
            BASE_URL,
            self.user_id.unwrap()
        );
        let response = client
            .get(&url)
            .query(&[("include", "tracks")])
            .send()
            .await?;
        let tracks = response.json::<TracksCollectionResponse>().await?;
        Ok(tracks)
    }

    pub async fn get_track(
        &self,
        track_id: &str,
        country_code: &str,
    ) -> Result<TrackResponse, Error> {
        if self.access_token.is_none() {
            return Err(anyhow::anyhow!(
                "Access token is not set. Please call get_access_token() first."
            ));
        }
        let client = Client::builder()
            .default_headers({
                let mut headers = reqwest::header::HeaderMap::new();
                headers.insert(
                    reqwest::header::AUTHORIZATION,
                    format!("Bearer {}", self.access_token.as_ref().unwrap())
                        .parse()
                        .unwrap(),
                );
                headers.insert(
                    reqwest::header::ACCEPT,
                    "application/vnd.api+json".parse().unwrap(),
                );
                headers
            })
            .build()?;
        let url = format!("{}/tracks/{}", BASE_URL, track_id);
        let response = client
            .get(&url)
            .query(&[
                ("include", "albums"),
                ("include", "artists"),
                ("include", "genres"),
                ("include", "lyrics"),
                ("include", "owners"),
                ("countryCode", country_code),
            ])
            .send()
            .await?;
        let track = response.json::<TrackResponse>().await?;
        Ok(track)
    }

    pub async fn get_tracks(
        &self,
        track_ids: Vec<&str>,
        country_code: &str,
    ) -> Result<TracksResponse, Error> {
        if self.access_token.is_none() {
            return Err(anyhow::anyhow!(
                "Access token is not set. Please call get_access_token() first."
            ));
        }
        let client = Client::builder()
            .default_headers({
                let mut headers = reqwest::header::HeaderMap::new();
                headers.insert(
                    reqwest::header::AUTHORIZATION,
                    format!("Bearer {}", self.access_token.as_ref().unwrap())
                        .parse()
                        .unwrap(),
                );
                headers.insert(
                    reqwest::header::ACCEPT,
                    "application/vnd.api+json".parse().unwrap(),
                );
                headers
            })
            .build()?;
        let url = &format!("{}/tracks", BASE_URL);
        let filter_id = track_ids
            .into_iter()
            .map(|id| ("filter[id]", id))
            .collect::<Vec<(&str, &str)>>();
        let mut query_params = vec![
            ("include", "albums"),
            ("include", "artists"),
            ("include", "genres"),
            ("include", "lyrics"),
            ("countryCode", country_code),
        ];
        query_params.extend(filter_id);
        let response = client.get(url).query(&query_params).send().await?;
        let tracks = response.json::<TracksResponse>().await?;
        Ok(tracks)
    }

    pub async fn get_album(
        &self,
        album_id: &str,
        country_code: &str,
    ) -> Result<AlbumResponse, Error> {
        if self.access_token.is_none() {
            return Err(anyhow::anyhow!(
                "Access token is not set. Please call get_access_token() first."
            ));
        }
        let client = Client::builder()
            .default_headers({
                let mut headers = reqwest::header::HeaderMap::new();
                headers.insert(
                    reqwest::header::AUTHORIZATION,
                    format!("Bearer {}", self.access_token.as_ref().unwrap())
                        .parse()
                        .unwrap(),
                );
                headers.insert(
                    reqwest::header::ACCEPT,
                    "application/vnd.api+json".parse().unwrap(),
                );
                headers
            })
            .build()?;
        let url = format!("{}/albums/{}", BASE_URL, album_id);
        let response = client
            .get(&url)
            .query(&[
                ("include", "items"),
                ("include", "artists"),
                ("include", "genres"),
                ("include", "coverArt"),
                ("countryCode", country_code),
            ])
            .send()
            .await?;
        let album = response.json::<AlbumResponse>().await?;
        Ok(album)
    }

    pub async fn get_artist(
        &self,
        artist_id: &str,
        country_code: &str,
    ) -> Result<ArtistResponse, Error> {
        if self.access_token.is_none() {
            return Err(anyhow::anyhow!(
                "Access token is not set. Please call get_access_token() first."
            ));
        }
        let client = Client::builder()
            .default_headers({
                let mut headers = reqwest::header::HeaderMap::new();
                headers.insert(
                    reqwest::header::AUTHORIZATION,
                    format!("Bearer {}", self.access_token.as_ref().unwrap())
                        .parse()
                        .unwrap(),
                );
                headers.insert(
                    reqwest::header::ACCEPT,
                    "application/vnd.api+json".parse().unwrap(),
                );
                headers
            })
            .build()?;
        let url = format!("{}/artists/{}", BASE_URL, artist_id);
        let response = client
            .get(&url)
            .query(&[
                ("include", "biography"),
                ("include", "profileArt"),
                ("include", "roles"),
                ("countryCode", country_code),
            ])
            .send()
            .await?;
        let artist = response.json::<ArtistResponse>().await?;
        Ok(artist)
    }
}
