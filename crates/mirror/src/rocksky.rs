//! XRPC client for `app.rocksky.scrobble.createScrobble`.
//!
//! Mirrors the call sites in `crates/spotify` and `crates/navidrome`: a JWT
//! bearer is built from the user's DID, then we POST the normalized track to
//! the API. The server handler is fire-and-forget (returns immediately after
//! kicking off the scrobble pipeline), but it does its own ±60s dedup, so a
//! duplicate slipping past our ±120s pre-check is still safe.

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
