//! Subsonic credentials for the library plane.
//!
//! Rocksky's Navidrome accepts the account handle plus a dedicated API key.
//! They are cached in `~/.rocksky/navidrome.json` — the same file the CLI and
//! playerd use, so provisioning happens once per machine no matter which one
//! got there first.

use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::config::expand_tilde;

#[derive(Serialize, Deserialize, Clone)]
pub struct NavidromeCreds {
    pub handle: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
}

fn navidrome_creds_path() -> PathBuf {
    expand_tilde("~/.rocksky/navidrome.json")
}

/// Read — or, on first use, provision — the cached credentials.
pub async fn navidrome_creds(
    http: &reqwest::Client,
    api_url: &str,
    token: &str,
) -> Result<NavidromeCreds> {
    let path = navidrome_creds_path();
    if let Ok(raw) = std::fs::read_to_string(&path) {
        if let Ok(creds) = serde_json::from_str::<NavidromeCreds>(&raw) {
            return Ok(creds);
        }
    }

    #[derive(Deserialize)]
    struct ProfileHandle {
        handle: String,
    }
    let profile: ProfileHandle = http
        .get(format!("{api_url}/profile"))
        .bearer_auth(token)
        .send()
        .await
        .context("fetching profile")?
        .error_for_status()
        .context("fetching profile")?
        .json()
        .await
        .context("parsing profile")?;

    #[derive(Deserialize)]
    struct ApiKey {
        api_key: String,
    }
    let key: ApiKey = http
        .post(format!("{api_url}/apikeys"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "name": "rocksky-mcp" }))
        .send()
        .await
        .context("creating API key")?
        .error_for_status()
        .context("creating API key")?
        .json()
        .await
        .context("parsing API key")?;

    let creds = NavidromeCreds {
        handle: profile.handle,
        api_key: key.api_key,
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    // A cache miss costs an API key; losing the write is not fatal, but it
    // would mint a new one on every start.
    if let Err(e) = std::fs::write(&path, serde_json::to_vec_pretty(&creds)?) {
        tracing::warn!(
            "could not cache navidrome credentials in {}: {e}",
            path.display()
        );
    }
    Ok(creds)
}
