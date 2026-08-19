use std::env;

use anyhow::Error;
use reqwest::Client;

use crate::types::{self, token::AccessToken};

pub const DEFAULT_BASE_URL: &str = "https://api.spotify.com/v1";

pub fn base_url() -> String {
    env::var("SPOTIFY_API_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string())
}

pub async fn refresh_token(
    token: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<AccessToken, Error> {
    let client = Client::new();

    let response = client
        .post("https://accounts.spotify.com/api/token")
        .basic_auth(&client_id, Some(client_secret))
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", token),
            ("client_id", &client_id),
        ])
        .send()
        .await?;
    let token = response.json::<AccessToken>().await?;
    Ok(token)
}

pub async fn get_user_playlists(
    token: String,
    client_id: String,
    client_secret: String,
) -> Result<Vec<types::playlist::Playlist>, Error> {
    let token = refresh_token(&token, &client_id, &client_secret).await?;
    let client = Client::new();
    let response = client
        .get(format!("{}/me/playlists", base_url()))
        .header("Authorization", format!("Bearer {}", token.access_token))
        .send()
        .await?;
    let playlists = response.json::<types::playlist::SpotifyResponse>().await?;
    let mut all_playlists = vec![];

    for playlist in playlists.items {
        all_playlists.push(get_playlist(&playlist.id, &token.access_token).await?);
        // wait for 1 second to avoid rate limiting
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    Ok(all_playlists)
}

pub async fn get_playlist(id: &str, token: &str) -> Result<types::playlist::Playlist, Error> {
    let client = Client::new();
    let response = client
        .get(format!("{}/playlists/{}", base_url(), id))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;

    let playlist = response.json::<types::playlist::Playlist>().await?;
    Ok(playlist)
}
