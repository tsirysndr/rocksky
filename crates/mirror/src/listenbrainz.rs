//! ListenBrainz mirror — `user/{name}/listens?min_ts=...` polled every 30s.
//!
//! ListenBrainz tokens are sent as `Authorization: Token <token>`. We page
//! with `min_ts` (exclusive lower bound) so the watermark trims the response
//! server-side.

use std::time::Duration;

use anyhow::Error;
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::Deserialize;
use sqlx::{Pool, Postgres};
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};

use crate::{
    crypto,
    db::{self, MirrorSourceRow},
    dedup,
    enrich::Enricher,
    rocksky,
    track::NormalizedTrack,
    Provider,
};

const POLL_INTERVAL: Duration = Duration::from_secs(30);
const RECENT_LIMIT: u32 = 50;

pub async fn run_user(
    pool: Pool<Postgres>,
    http: Client,
    enricher: Enricher,
    row: MirrorSourceRow,
    cancel: CancellationToken,
) -> Result<(), Error> {
    // Token is optional for the read endpoint — public listens work without
    // one — but we keep it for higher rate limits and parity with Last.fm.
    let token = match row.encrypted_api_key.as_deref() {
        Some(enc) => Some(crypto::decrypt(enc)?),
        None => None,
    };
    let Some(username) = row.external_username.clone() else {
        warn!(user_id = %row.user_id, "ListenBrainz: no external username, exiting task");
        return Ok(());
    };

    info!(
        user_id = %row.user_id,
        did = %row.did,
        username = %username,
        interval_secs = POLL_INTERVAL.as_secs(),
        "ListenBrainz: starting poll loop"
    );

    let mut watermark = row.last_scrobble_seen_at_utc().unwrap_or_else(Utc::now);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                info!(user_id = %row.user_id, "ListenBrainz: cancelled");
                return Ok(());
            }
            _ = tokio::time::sleep(POLL_INTERVAL) => {}
        }

        match poll_once(
            &pool,
            &http,
            &enricher,
            &row,
            token.as_deref(),
            &username,
            watermark,
        )
        .await
        {
            Ok(new_watermark) => watermark = new_watermark,
            Err(e) => {
                error!(user_id = %row.user_id, error = %e, "ListenBrainz: poll failed");
            }
        }
    }
}

async fn poll_once(
    pool: &Pool<Postgres>,
    http: &Client,
    enricher: &Enricher,
    row: &MirrorSourceRow,
    token: Option<&str>,
    username: &str,
    watermark: DateTime<Utc>,
) -> Result<DateTime<Utc>, Error> {
    info!(user_id = %row.user_id, "ListenBrainz: polling listens");

    let url = format!("https://api.listenbrainz.org/1/user/{username}/listens");
    let mut req = http.get(&url).query(&[
        ("count", &RECENT_LIMIT.to_string()),
        ("min_ts", &watermark.timestamp().to_string()),
    ]);
    if let Some(t) = token {
        req = req.header("Authorization", format!("Token {t}"));
    }

    let resp: ListensResponse = req.send().await?.error_for_status()?.json().await?;
    let items = resp.payload.listens.unwrap_or_default();

    info!(
        user_id = %row.user_id,
        fetched = items.len(),
        watermark = watermark.to_rfc3339(),
        "ListenBrainz: fetched listens"
    );

    let mut max_seen = watermark;
    let mut mirrored = 0usize;
    let mut skipped_dedup = 0usize;

    // ListenBrainz returns newest-first; iterate oldest-first.
    for listen in items.into_iter().rev() {
        let at = DateTime::from_timestamp(listen.listened_at, 0).unwrap_or(watermark);
        if at <= watermark {
            continue;
        }

        let m = &listen.track_metadata;
        let title = m.track_name.trim().to_string();
        let artist = m.artist_name.trim().to_string();
        let album = m
            .release_name
            .clone()
            .unwrap_or_default()
            .trim()
            .to_string();
        if title.is_empty() || artist.is_empty() {
            continue;
        }

        if dedup::already_scrobbled(pool, &row.user_id, &title, &artist, at).await? {
            info!(
                user_id = %row.user_id,
                title = %title,
                artist = %artist,
                at = at.to_rfc3339(),
                "ListenBrainz: skipped (already scrobbled within 120s)"
            );
            skipped_dedup += 1;
            if at > max_seen {
                max_seen = at;
            }
            continue;
        }

        let info = m.additional_info.as_ref();
        let duration_ms = info
            .and_then(|i| i.duration_ms)
            .or_else(|| info.and_then(|i| i.duration.map(|s| s as i64 * 1000)))
            .unwrap_or(0);

        let mut track = NormalizedTrack {
            title,
            album_artist: artist.clone(),
            artist,
            album,
            duration: duration_ms,
            timestamp: listen.listened_at,
            mb_id: m
                .mbid_mapping
                .as_ref()
                .and_then(|m| m.recording_mbid.clone()),
            album_art: None,
            spotify_link: info.and_then(|i| i.spotify_id.clone()),
            lastfm_link: None,
        };

        enricher.enrich(pool, http, &mut track).await;

        info!(
            user_id = %row.user_id,
            title = %track.title,
            artist = %track.artist,
            at = at.to_rfc3339(),
            "ListenBrainz: mirroring"
        );
        match rocksky::create_scrobble(http, &row.did, &track, Provider::Listenbrainz).await {
            Ok(_) => mirrored += 1,
            Err(e) => warn!(user_id = %row.user_id, error = %e, "ListenBrainz: mirror failed"),
        }

        if at > max_seen {
            max_seen = at;
        }
    }

    info!(
        user_id = %row.user_id,
        mirrored,
        skipped_dedup,
        "ListenBrainz: poll complete"
    );

    db::touch_polled(pool, &row.user_id, Provider::Listenbrainz, Some(max_seen)).await?;
    Ok(max_seen)
}

#[derive(Debug, Deserialize)]
struct ListensResponse {
    payload: ListensPayload,
}

#[derive(Debug, Deserialize)]
struct ListensPayload {
    listens: Option<Vec<Listen>>,
}

#[derive(Debug, Deserialize)]
struct Listen {
    listened_at: i64,
    track_metadata: TrackMetadata,
}

#[derive(Debug, Deserialize)]
struct TrackMetadata {
    track_name: String,
    artist_name: String,
    release_name: Option<String>,
    additional_info: Option<AdditionalInfo>,
    mbid_mapping: Option<MbidMapping>,
}

#[derive(Debug, Deserialize)]
struct AdditionalInfo {
    duration_ms: Option<i64>,
    duration: Option<i32>,
    spotify_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MbidMapping {
    recording_mbid: Option<String>,
}
