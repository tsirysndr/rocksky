use anyhow::Error;
use reqwest::Client;
use types::AccessToken;

pub mod client;
pub mod types;

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
