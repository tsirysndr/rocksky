use anyhow::Error;

use crate::types::{Profile, ProfileResponse};

/// Resolves a DID to its DID document, via the PLC directory (overridable
/// with `PLC_DIRECTORY_URL`, e.g. to point at the plc-proxy Worker) or the
/// domain's well-known for `did:web`.
async fn did_document(did: &str) -> Result<serde_json::Value, Error> {
    let client = reqwest::Client::new();
    let plc_url =
        std::env::var("PLC_DIRECTORY_URL").unwrap_or_else(|_| "https://plc.directory".to_string());
    let mut url = format!("{}/{}", plc_url.trim_end_matches('/'), did);

    if did.starts_with("did:web:") {
        let domain = did
            .trim_start_matches("did:web:")
            .split(':')
            .next()
            .unwrap_or("");
        url = format!("https://{}/.well-known/did.json", domain);
    }

    Ok(client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?)
}

/// The DID's PDS service endpoint, e.g. `https://shiitake.us-east.host.bsky.network`.
pub async fn did_to_pds(did: &str) -> Result<String, Error> {
    let doc = did_document(did).await?;
    let endpoint = doc["service"][0]["serviceEndpoint"]
        .as_str()
        .unwrap_or("")
        .to_string();
    if endpoint.is_empty() {
        return Err(Error::msg("Invalid did"));
    }
    Ok(endpoint)
}

pub async fn did_to_profile(did: &str) -> Result<Profile, Error> {
    let response = did_document(did).await?;

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
    let response = client.get(format!("{}/xrpc/com.atproto.repo.getRecord?repo={}&collection=app.bsky.actor.profile&rkey=self", service_endpoint, did))
    .header("Accept", "application/json")
    .send()
    .await?;

    // A Rocksky-only account (typically on a self-hosted PDS) may never have
    // written a Bluesky profile; the PDS answers 400 RecordNotFound. Index it
    // from the DID document alone instead of failing every commit it makes.
    if response.status() == reqwest::StatusCode::BAD_REQUEST {
        let body: serde_json::Value = response.json().await.unwrap_or_default();
        if body["error"] == "RecordNotFound" {
            return Ok(Profile {
                r#type: "app.bsky.actor.profile".to_string(),
                avatar: None,
                banner: None,
                created_at: None,
                pinned_post: None,
                description: None,
                display_name: None,
                handle: Some(handle.to_string()),
            });
        }
        return Err(Error::msg(format!("profile lookup failed: {body}")));
    }

    let mut response = response
        .error_for_status()?
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
        assert!(profile
            .display_name
            .map(|s| s.starts_with("Tsiry Sandratraina"))
            .unwrap_or(false));
        assert!(profile
            .handle
            .map(|s| s == "tsiry-sandratraina.com")
            .unwrap_or(false));

        let did = "did:plc:d5jvs7uo4z6lw63zzreukgt4";
        let profile = did_to_profile(did).await?;
        assert_eq!(profile.r#type, "app.bsky.actor.profile");

        let did = "did:plc:gwxwdfmun3aqaiu5mx7nnyof";
        let profile = did_to_profile(did).await?;
        assert_eq!(profile.r#type, "app.bsky.actor.profile");

        let did = "did:web:jb.waf.moe";
        let profile = did_to_profile(did).await?;

        assert_eq!(profile.r#type, "app.bsky.actor.profile");
        assert!(profile
            .display_name
            .map(|s| s.starts_with("jb"))
            .unwrap_or(false));
        assert!(profile.handle.map(|s| s == "jbc.lol").unwrap_or(false));

        Ok(())
    }

    #[tokio::test]
    async fn test_did_to_profile_without_bluesky_profile_record() -> Result<()> {
        // Rocksky-only account on a self-hosted PDS: no app.bsky.actor.profile.
        let profile = did_to_profile("did:plc:s7faxbdxp6rzyf6tpmrbcbzf").await?;

        assert_eq!(profile.r#type, "app.bsky.actor.profile");
        assert_eq!(profile.handle.as_deref(), Some("section.rocksky.social"));
        assert!(profile.display_name.is_none());
        assert!(profile.avatar.is_none());

        Ok(())
    }
}
