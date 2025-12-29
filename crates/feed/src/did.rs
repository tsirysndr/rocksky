use anyhow::Error;

use crate::types::{Profile, ProfileResponse};

pub async fn did_to_profile(did: &str) -> Result<Profile, Error> {
    let client = reqwest::Client::new();
    let response = client
        .get(format!("https://plc.directory/{}", did))
        .header("Accept", "application/json")
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let handle = response["alsoKnownAs"][0]
        .as_str()
        .unwrap_or("")
        .split("at://")
        .last()
        .unwrap_or("");

    let service_endpoint = response["service"][0]["serviceEndpoint"]
        .as_str()
        .unwrap_or("");

    if service_endpoint.is_empty() {
        return Err(Error::msg("Invalid did"));
    }

    let client = reqwest::Client::new();
    let mut response = client.get(format!("{}/xrpc/com.atproto.repo.getRecord?repo={}&collection=app.bsky.actor.profile&rkey=self", service_endpoint, did))
    .header("Accept", "application/json")
    .send()
    .await?
    .json::<ProfileResponse>()
    .await?;

    response.value.handle = Some(handle.to_string());
    Ok(response.value)
}
