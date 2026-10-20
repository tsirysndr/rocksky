//! XRPC client for `app.rocksky.scrobble.createScrobble`.
//!
//! Mirrors the call sites in `crates/spotify` and `crates/navidrome`: a JWT
//! bearer is built from the user's DID, then we POST the normalized track to
//! the API. Success means the submission was durably accepted; publication
//! happens in the worker. Timestamped retries reuse the same submission key.

use std::env;

use anyhow::{Context, Error};
use reqwest::Client;
use tracing::{info, warn};

use crate::{token, track::NormalizedTrack, Provider};

const DEFAULT_API: &str = "https://api.rocksky.app";

const CREATE_SCROBBLE_NSID: &str = "app.rocksky.scrobble.createScrobble";

pub async fn create_scrobble(
    client: &Client,
    did: &str,
    track: &NormalizedTrack,
    provider: Provider,
) -> Result<(), Error> {
    let api = env::var("ROCKSKY_API").unwrap_or_else(|_| DEFAULT_API.to_string());
    let url = format!("{api}/xrpc/{CREATE_SCROBBLE_NSID}");

    let bearer = token::generate(did).context("failed to mint JWT for createScrobble")?;
    let res = client
        .post(&url)
        .bearer_auth(bearer)
        .header("x-rocksky-mirror-provider", provider.as_str())
        .json(track)
        .send()
        .await?;

    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        warn!(
            provider = provider.as_str(),
            %did,
            title = %track.title,
            artist = %track.artist,
            %status,
            %body,
            "createScrobble returned non-success"
        );
        // 400 and 422 mean the payload itself is wrong, so re-posting it
        // unchanged can never succeed. Everything else (auth, rate limits,
        // upstream faults) clears on its own and must keep the watermark put.
        if matches!(status.as_u16(), 400 | 422) {
            return Err(Error::new(Refused { status, body }));
        }
        return Err(anyhow::anyhow!(
            "createScrobble {} returned {}",
            url,
            status
        ));
    }

    info!(
        provider = provider.as_str(),
        %did,
        title = %track.title,
        artist = %track.artist,
        timestamp = track.timestamp,
        "mirrored scrobble"
    );
    Ok(())
}

/// A submission the API refused on its merits. Retrying the identical payload
/// cannot succeed, so callers skip it instead of blocking every later play.
#[derive(Debug)]
pub struct Refused {
    pub status: reqwest::StatusCode,
    pub body: String,
}

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "createScrobble refused the submission: {}", self.status)
    }
}

impl std::error::Error for Refused {}

/// Whether a failed submission can never succeed on retry.
pub fn is_refusal(error: &Error) -> bool {
    error.downcast_ref::<Refused>().is_some()
}
