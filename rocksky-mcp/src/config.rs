//! Where the server points and who it acts as.
//!
//! Everything has a working default, so the common case — `rocksky login`
//! followed by `rocksky mcp` — needs no configuration at all. Flags override
//! environment variables, which override the defaults.

use std::path::PathBuf;

use anyhow::{anyhow, bail, Result};

/// The hosted Rocksky AppView. The library server is not configurable at all —
/// see [`crate::subsonic`].
pub const DEFAULT_API_URL: &str = rocksky_sdk::DEFAULT_APPVIEW;

#[derive(Clone)]
pub struct Config {
    /// Rocksky AppView / API base URL.
    pub api_url: String,
    /// Remote-control WebSocket the player devices register on.
    pub ws_url: String,
    /// Device the command tools address when a call does not name one.
    pub device: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            api_url: DEFAULT_API_URL.to_string(),
            ws_url: rocksky_sdk::DEFAULT_REMOTE_WS.to_string(),
            device: None,
        }
    }
}

pub fn expand_tilde(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(path)
}

/// The access token written by `rocksky login`, unless one was passed in.
pub fn resolve_token(cli_token: Option<String>, token_path: &str) -> Result<String> {
    if let Some(token) = cli_token.filter(|t| !t.trim().is_empty()) {
        return Ok(token);
    }
    let path = expand_tilde(token_path);
    if !path.exists() {
        bail!(
            "no access token: run `rocksky login <handle>` first (looked for {})",
            path.display()
        );
    }
    let raw = std::fs::read_to_string(&path)?;
    let value: serde_json::Value = serde_json::from_str(&raw)?;
    value
        .get("token")
        .and_then(|t| t.as_str())
        .map(String::from)
        .ok_or_else(|| anyhow!("no \"token\" field in {}", path.display()))
}
