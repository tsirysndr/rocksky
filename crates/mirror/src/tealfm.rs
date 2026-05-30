//! Teal.fm mirror — one Jetstream WebSocket connection for all enabled users.
//!
//! We subscribe to `fm.teal.alpha.feed.play` and look up the commit's `did`
//! against a per-process `enabled_dids` set. The Jetstream URL filter cheaply
//! drops everything outside this collection, so the only work we do per event
//! is a DID set lookup + optional dedup query.
//!
//! Note: the user spec said `fm.teal.alpha.play`, but the actual NSID used by
//! `apps/api/src/tealfm/index.ts` is `fm.teal.alpha.feed.play`. We use the
//! real one.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Error;
use chrono::{DateTime, Utc};
use futures_util::StreamExt;
use reqwest::Client;
use serde::Deserialize;
use sqlx::{Pool, Postgres};
use std::collections::HashSet;
use std::env;
use tokio::sync::RwLock;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};

use crate::{
    db, dedup, enrich::Enricher, rocksky, track::NormalizedTrack, Provider, TEALFM_PLAY_NSID,
};

/// Set of DIDs currently mirroring Teal.fm — shared with the supervisor so it
/// can add/remove members in response to NATS toggle events.
pub type EnabledDids = Arc<RwLock<HashSet<String>>>;

pub async fn run(
    pool: Pool<Postgres>,
    http: Client,
    enricher: Enricher,
    enabled_dids: EnabledDids,
    cancel: CancellationToken,
) -> Result<(), Error> {
    let server = env::var("JETSTREAM_SERVER")
        .unwrap_or_else(|_| "wss://jetstream2.us-west.bsky.network".to_string());
    let url = format!("{server}/subscribe?wantedCollections={TEALFM_PLAY_NSID}");

    info!(url = %url, "Teal.fm: starting Jetstream subscriber");

    loop {
        if cancel.is_cancelled() {
            info!("Teal.fm: cancelled");
            return Ok(());
        }

        match run_once(&pool, &http, &enricher, &enabled_dids, &url, &cancel).await {
            Ok(_) => warn!("Teal.fm: subscriber returned cleanly, reconnecting"),
            Err(e) => error!(error = %e, "Teal.fm: subscriber error"),
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

async fn run_once(
    pool: &Pool<Postgres>,
    http: &Client,
    enricher: &Enricher,
    enabled_dids: &EnabledDids,
    url: &str,
    cancel: &CancellationToken,
) -> Result<(), Error> {
    let (mut ws, _) = connect_async(url).await?;
    info!(url = %url, "Teal.fm: connected to Jetstream");

    loop {
        tokio::select! {
            _ = cancel.cancelled() => return Ok(()),
            msg = ws.next() => {
                let Some(msg) = msg else {
                    warn!("Teal.fm: stream ended");
                    return Ok(());
                };
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Err(e) = handle_event(pool, http, enricher, enabled_dids, &text).await {
                            warn!(error = %e, "Teal.fm: handle_event failed");
                        }
                    }
                    Ok(Message::Ping(_)) | Ok(Message::Pong(_)) | Ok(Message::Binary(_)) => {}
                    Ok(Message::Close(_)) => {
                        info!("Teal.fm: Jetstream closed connection");
                        return Ok(());
                    }
                    Ok(Message::Frame(_)) => {}
                    Err(e) => {
                        warn!(error = %e, "Teal.fm: WS error");
                        return Ok(());
                    }
                }
            }
        }
    }
}

async fn handle_event(
    pool: &Pool<Postgres>,
    http: &Client,
    enricher: &Enricher,
    enabled_dids: &EnabledDids,
    text: &str,
) -> Result<(), Error> {
    let evt: JetstreamEvent = serde_json::from_str(text)?;
    if evt.kind != "commit" {
        return Ok(());
    }
    let Some(commit) = evt.commit else {
        return Ok(());
    };
    if commit.collection != TEALFM_PLAY_NSID {
        return Ok(());
    }
    if commit.operation != "create" {
        info!(operation = %commit.operation, "Teal.fm: ignoring non-create");
        return Ok(());
    }

    // Cheap path first: is this DID enabled?
    let did = evt.did;
    {
        let set = enabled_dids.read().await;
        if !set.contains(&did) {
            return Ok(());
        }
    }

    let Some(record) = commit.record else {
        return Ok(());
    };
    let play: PlayRecord = match serde_json::from_value(record) {
        Ok(p) => p,
        Err(e) => {
            warn!(error = %e, "Teal.fm: failed to parse play record");
            return Ok(());
        }
    };

    let Some(user_id) = db::user_id_for_did(pool, &did).await? else {
        warn!(did = %did, "Teal.fm: enabled DID has no users row, dropping from set");
        enabled_dids.write().await.remove(&did);
        return Ok(());
    };

    let title = play.track_name.trim().to_string();
    let artist = play
        .artists
        .first()
        .map(|a| a.artist_name.trim().to_string())
        .unwrap_or_default();
    let album = play.release_name.unwrap_or_default().trim().to_string();
    if title.is_empty() || artist.is_empty() {
        return Ok(());
    }

    let at: DateTime<Utc> = play
        .played_time
        .parse::<DateTime<Utc>>()
        .unwrap_or_else(|_| Utc::now());

    info!(
        did = %did,
        user_id = %user_id,
        title = %title,
        artist = %artist,
        at = at.to_rfc3339(),
        "Teal.fm: received play event"
    );

    let mb_id = play.recording_mb_id.clone().map(strip_mbid_prefix);
    let isrc = play.isrc.clone();

    if dedup::already_scrobbled(
        pool,
        &user_id,
        &title,
        &artist,
        mb_id.as_deref(),
        isrc.as_deref(),
        at,
    )
    .await?
    {
        info!(
            did = %did,
            title = %title,
            artist = %artist,
            "Teal.fm: skipped (already scrobbled within 120s)"
        );
        return Ok(());
    }

    let mut track = NormalizedTrack {
        title,
        album_artist: artist.clone(),
        artist,
        album,
        duration: play.duration.map(|d| d as i64 * 1000).unwrap_or(0),
        timestamp: at.timestamp(),
        mb_id,
        isrc: play.isrc.clone(),
        album_art: None,
        spotify_link: None,
        lastfm_link: None,
        track_number: None,
        disc_number: None,
    };

    enricher.enrich(pool, http, &mut track).await;

    info!(
        did = %did,
        title = %track.title,
        "Teal.fm: mirroring"
    );
    if let Err(e) = rocksky::create_scrobble(http, &did, &track, Provider::Tealfm).await {
        warn!(did = %did, error = %e, "Teal.fm: mirror failed");
    }
    Ok(())
}

fn strip_mbid_prefix(s: String) -> String {
    s.strip_prefix("mbid:").map(str::to_string).unwrap_or(s)
}

#[derive(Debug, Deserialize)]
struct JetstreamEvent {
    did: String,
    kind: String,
    commit: Option<Commit>,
}

#[derive(Debug, Deserialize)]
struct Commit {
    operation: String,
    collection: String,
    record: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayRecord {
    track_name: String,
    played_time: String,
    duration: Option<i32>,
    release_name: Option<String>,
    artists: Vec<PlayArtist>,
    recording_mb_id: Option<String>,
    isrc: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayArtist {
    artist_name: String,
}
