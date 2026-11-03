//! Teal.fm mirror — one Jetstream WebSocket connection for all enabled users.
//!
//! We subscribe to both the legacy `fm.teal.alpha.feed.play` and production
//! `fm.teal.feed.play` collections and look up each commit's `did` against a
//! per-process `enabled_dids` set. The Jetstream URL filter cheaply drops
//! everything outside these collections, so the only work we do per event is a
//! DID set lookup + optional dedup query.

use rocksky_db::Backend;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Error;
use chrono::{DateTime, Utc};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashSet;
use std::env;
use tokio::{
    io::{AsyncRead, AsyncWrite},
    sync::RwLock,
    time::{interval, timeout, Interval, MissedTickBehavior},
};
use tokio_tungstenite::{connect_async, tungstenite::Message, WebSocketStream};
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};

use crate::{
    db, dedup,
    enrich::Enricher,
    rocksky,
    track::{normalize_text, NormalizedTrack},
    Provider, TEALFM_PLAY_NSIDS,
};

/// Set of DIDs currently mirroring Teal.fm — shared with the supervisor so it
/// can add/remove members in response to NATS toggle events.
pub type EnabledDids = Arc<RwLock<HashSet<String>>>;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const RECEIVE_TIMEOUT: Duration = Duration::from_secs(90);

pub async fn run(
    pool: Backend,
    http: Client,
    enricher: Enricher,
    enabled_dids: EnabledDids,
    cancel: CancellationToken,
) -> Result<(), Error> {
    let server = env::var("JETSTREAM_SERVER")
        .unwrap_or_else(|_| "wss://jetstream2.us-west.bsky.network".to_string());
    let url = format!(
        "{server}/subscribe?wantedCollections={}&wantedCollections={}",
        TEALFM_PLAY_NSIDS[0], TEALFM_PLAY_NSIDS[1]
    );

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
        tokio::select! {
            _ = cancel.cancelled() => return Ok(()),
            _ = tokio::time::sleep(Duration::from_secs(2)) => {}
        }
    }
}

async fn run_once(
    pool: &Backend,
    http: &Client,
    enricher: &Enricher,
    enabled_dids: &EnabledDids,
    url: &str,
    cancel: &CancellationToken,
) -> Result<(), Error> {
    let (mut ws, _) = tokio::select! {
        _ = cancel.cancelled() => return Ok(()),
        result = timeout(CONNECT_TIMEOUT, connect_async(url)) => result??,
    };
    info!(url = %url, "Teal.fm: connected to Jetstream");
    let mut heartbeat = interval(HEARTBEAT_INTERVAL);
    heartbeat.set_missed_tick_behavior(MissedTickBehavior::Delay);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => return Ok(()),
            msg = next_message(&mut ws, &mut heartbeat) => {
                let msg = msg?;
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

/// A TCP connection can remain established after its peer stops responding.
/// Probe it even on a quiet collection, and reconnect if no frame arrives.
/// Keep the timeout outside the heartbeat loop so sending pings cannot extend it.
async fn next_message<S>(
    ws: &mut WebSocketStream<S>,
    heartbeat: &mut Interval,
) -> Result<Option<Result<Message, tokio_tungstenite::tungstenite::Error>>, Error>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    timeout(RECEIVE_TIMEOUT, async {
        loop {
            tokio::select! {
                msg = ws.next() => return Ok(msg),
                _ = heartbeat.tick() => ws.send(Message::Ping(Vec::new().into())).await?,
            }
        }
    })
    .await
    .map_err(|_| anyhow::anyhow!("Teal.fm: no Jetstream frame for 90 seconds, reconnecting"))?
}

async fn handle_event(
    pool: &Backend,
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
    if !TEALFM_PLAY_NSIDS.contains(&commit.collection.as_str()) {
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
    // Our outgoing plays already have a Rocksky source; never mirror them back.
    if record
        .get("submissionClientAgent")
        .and_then(|v| v.as_str())
        .is_some_and(|agent| agent.starts_with("rocksky/"))
    {
        return Ok(());
    }
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

    let title = normalize_text(&play.track_name);
    let artist = play
        .artists
        .first()
        .map(|a| normalize_text(&a.artist_name))
        .unwrap_or_default();
    let album = normalize_text(&play.release_name.unwrap_or_default());
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
            "Teal.fm: skipped (already scrobbled within dedup window)"
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

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::duplex;
    use tokio_tungstenite::tungstenite::protocol::Role;

    #[tokio::test(start_paused = true)]
    async fn silent_open_connection_times_out_despite_heartbeats() {
        let (client, _silent_peer) = duplex(4096);
        let mut ws = WebSocketStream::from_raw_socket(client, Role::Client, None).await;
        let mut heartbeat = interval(HEARTBEAT_INTERVAL);
        let started = tokio::time::Instant::now();

        let error = next_message(&mut ws, &mut heartbeat).await.unwrap_err();

        assert!(error.to_string().contains("no Jetstream frame"));
        assert_eq!(started.elapsed(), RECEIVE_TIMEOUT);
    }

    #[tokio::test(start_paused = true)]
    async fn quiet_responsive_connection_survives_multiple_timeout_windows() {
        let (client, peer) = duplex(4096);
        let mut ws = WebSocketStream::from_raw_socket(client, Role::Client, None).await;
        let mut server = WebSocketStream::from_raw_socket(peer, Role::Server, None).await;
        let peer_task = tokio::spawn(async move {
            while let Some(Ok(message)) = server.next().await {
                assert!(matches!(message, Message::Ping(_)));
                server.flush().await.unwrap();
            }
        });
        let mut heartbeat = interval(HEARTBEAT_INTERVAL);
        let started = tokio::time::Instant::now();

        for _ in 0..8 {
            let message = next_message(&mut ws, &mut heartbeat)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            assert!(matches!(message, Message::Pong(_)));
        }

        assert!(started.elapsed() > RECEIVE_TIMEOUT * 2);
        peer_task.abort();
    }
}
