use std::env;

use reqwest::Client;
use types::AccessToken;
use anyhow::Error;

pub mod client;
pub mod types;


pub async fn refresh_token(token: &str) -> Result<AccessToken, Error> {
  if env::var("SPOTIFY_CLIENT_ID").is_err() || env::var("SPOTIFY_CLIENT_SECRET").is_err() {
    panic!("Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables");
  }

  let client_id = env::var("SPOTIFY_CLIENT_ID")?;
  let client_secret = env::var("SPOTIFY_CLIENT_SECRET")?;

  let client = Client::new();

  let response = client.post("https://accounts.spotify.com/api/token")
    .basic_auth(&client_id, Some(client_secret))
    .form(&[
      ("grant_type", "refresh_token"),
      ("refresh_token", token),
      ("client_id", &client_id)
      ])
    .send()
    .await?;
  let token = response.json::<AccessToken>().await?;
  Ok(token)
}