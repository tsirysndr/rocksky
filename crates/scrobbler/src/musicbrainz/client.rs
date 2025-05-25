use super::recording::{Recording, Recordings};
use anyhow::Error;

pub const BASE_URL: &str = "https://musicbrainz.org/ws/2";
pub const USER_AGENT: &str = "Rocksky/0.1.0";

pub struct MusicbrainzClient {}

impl MusicbrainzClient {
    pub fn new() -> Self {
        MusicbrainzClient {}
    }

    pub async fn search(&self, query: &str) -> Result<Recordings, Error> {
        let url = format!("{}/recording", BASE_URL);
        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .header("Accept", "application/json")
            .header("User-Agent", USER_AGENT)
            .query(&[("query", query), ("inc", "artist-credits+releases")])
            .send()
            .await?;

        Ok(response.json().await?)
    }

    pub async fn get_recording(&self, mbid: &str) -> Result<Recording, Error> {
        let url = format!("{}/recording/{}", BASE_URL, mbid);
        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .header("Accept", "application/json")
            .header("User-Agent", USER_AGENT)
            .query(&[("inc", "artist-credits+releases")])
            .send()
            .await?;

        Ok(response.json().await?)
    }
}
