use anyhow::Error;

use crate::types::{Profile, ProfileResponse};

pub async fn did_to_profile(did: &str) -> Result<Profile, Error> {
  let client = reqwest::Client::new();
  let response = client.get(format!("https://plc.directory/{}", did))
    .header("Accept", "application/json")
    .send()
    .await?
    .json::<serde_json::Value>()
    .await?;

  let handle = response["alsoKnownAs"][0].as_str()
    .unwrap_or("")
    .split("at://")
    .last()
    .unwrap_or("");

  let service_endpoint = response["service"][0]["serviceEndpoint"].as_str().unwrap_or("");

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

#[cfg(test)]
mod tests {
  use super::*;
  use anyhow::Result;

  #[tokio::test]
  async fn test_did_to_profile() -> Result<()> {
    let did = "did:plc:7vdlgi2bflelz7mmuxoqjfcr";
    let profile = did_to_profile(did).await?;

    assert_eq!(profile.r#type, "app.bsky.actor.profile");
    assert!(profile.display_name.map(|s| s.starts_with("Tsiry Sandratraina")).unwrap_or(false));
    assert!(profile.handle.map(|s| s == "tsiry-sandratraina.com").unwrap_or(false));

    let did = "did:plc:fgvx5xqinqoqgpfhito5er3s";
    let profile = did_to_profile(did).await?;

    assert_eq!(profile.r#type, "app.bsky.actor.profile");
    assert!(profile.display_name.map(|s| s.starts_with("Lixtrix")).unwrap_or(false));
    assert!(profile.handle.map(|s| s == "lixtrix.art").unwrap_or(false));

    let did = "did:plc:d5jvs7uo4z6lw63zzreukgt4";
    let profile = did_to_profile(did).await?;
    assert_eq!(profile.r#type, "app.bsky.actor.profile");

    let did = "did:plc:gwxwdfmun3aqaiu5mx7nnyof";
    let profile = did_to_profile(did).await?;
    assert_eq!(profile.r#type, "app.bsky.actor.profile");

    Ok(())
  }
}