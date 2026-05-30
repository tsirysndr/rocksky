//! Last.fm mirror — `user.getRecentTracks` polled every 30 seconds per user.
//!
//! Last.fm returns the currently-playing track at the top of the response with
//! `@attr.nowplaying = "true"`; those have no `date` and we skip them. Only
//! items with `date.uts` strictly newer than the watermark are mirrored.

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

const ENDPOINT: &str = "https://ws.audioscrobbler.com/2.0/";
const POLL_INTERVAL: Duration = Duration::from_secs(30);
const RECENT_LIMIT: u32 = 50;

pub async fn run_user(
    pool: Pool<Postgres>,
    http: Client,
    enricher: Enricher,
    row: MirrorSourceRow,
    cancel: CancellationToken,
) -> Result<(), Error> {
    let api_key = match row.encrypted_api_key.as_deref() {
        Some(enc) => crypto::decrypt(enc)?,
        None => {
            warn!(user_id = %row.user_id, "Last.fm: no API key, exiting task");
            return Ok(());
        }
    };
    let Some(username) = row.external_username.clone() else {
        warn!(user_id = %row.user_id, "Last.fm: no external username, exiting task");
        return Ok(());
    };

    info!(
        user_id = %row.user_id,
        did = %row.did,
        username = %username,
        interval_secs = POLL_INTERVAL.as_secs(),
        "Last.fm: starting poll loop"
    );

    let mut watermark = row.last_scrobble_seen_at_utc().unwrap_or_else(Utc::now);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                info!(user_id = %row.user_id, "Last.fm: cancelled");
                return Ok(());
            }
            _ = tokio::time::sleep(POLL_INTERVAL) => {}
        }

        match poll_once(
            &pool, &http, &enricher, &row, &api_key, &username, watermark,
        )
        .await
        {
            Ok(new_watermark) => watermark = new_watermark,
            Err(e) => {
                error!(user_id = %row.user_id, error = %e, "Last.fm: poll failed");
            }
        }
    }
}

async fn poll_once(
    pool: &Pool<Postgres>,
    http: &Client,
    enricher: &Enricher,
    row: &MirrorSourceRow,
    api_key: &str,
    username: &str,
    watermark: DateTime<Utc>,
) -> Result<DateTime<Utc>, Error> {
    info!(user_id = %row.user_id, "Last.fm: polling getRecentTracks");

    let resp: RecentTracksResponse = http
        .get(ENDPOINT)
        .query(&[
            ("method", "user.getrecenttracks"),
            ("user", username),
            ("api_key", api_key),
            ("format", "json"),
            ("limit", &RECENT_LIMIT.to_string()),
            ("from", &watermark.timestamp().to_string()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let items = resp.recenttracks.track.unwrap_or_default();
    info!(
        user_id = %row.user_id,
        fetched = items.len(),
        watermark = watermark.to_rfc3339(),
        "Last.fm: fetched recent tracks"
    );

    let mut max_seen = watermark;
    let mut mirrored = 0usize;
    let mut skipped_nowplaying = 0usize;
    let mut skipped_dedup = 0usize;

    // Last.fm returns newest-first; iterate oldest-first so the watermark
    // moves monotonically.
    for item in items.into_iter().rev() {
        if item.attr.as_ref().and_then(|a| a.nowplaying.as_deref()) == Some("true") {
            skipped_nowplaying += 1;
            continue;
        }
        let Some(date) = item.date else { continue };
        let Ok(uts) = date.uts.parse::<i64>() else {
            continue;
        };
        let at = DateTime::from_timestamp(uts, 0).unwrap_or(watermark);
        if at <= watermark {
            continue;
        }

        let title = item.name.trim().to_string();
        let artist = item.artist.text.unwrap_or_default().trim().to_string();
        let album = item.album.text.unwrap_or_default().trim().to_string();
        let mb_id = nonempty(item.mbid.clone());

        if title.is_empty() || artist.is_empty() {
            continue;
        }

        if dedup::already_scrobbled(
            pool,
            &row.user_id,
            &title,
            &artist,
            mb_id.as_deref(),
            None,
            at,
        )
        .await?
        {
            info!(
                user_id = %row.user_id,
                title = %title,
                artist = %artist,
                at = at.to_rfc3339(),
                "Last.fm: skipped (already scrobbled within 120s)"
            );
            skipped_dedup += 1;
            if at > max_seen {
                max_seen = at;
            }
            continue;
        }

        let mut track = NormalizedTrack {
            title,
            album_artist: artist.clone(),
            artist,
            album,
            duration: 0, // user.getrecenttracks doesn't include duration
            timestamp: uts,
            mb_id,
            isrc: None,
            album_art: largest_image(&item.image),
            spotify_link: None,
            lastfm_link: nonempty(item.url),
        };

        enricher.enrich(pool, http, &mut track).await;

        info!(
            user_id = %row.user_id,
            title = %track.title,
            artist = %track.artist,
            at = at.to_rfc3339(),
            "Last.fm: mirroring"
        );
        match rocksky::create_scrobble(http, &row.did, &track, Provider::Lastfm).await {
            Ok(_) => mirrored += 1,
            Err(e) => warn!(user_id = %row.user_id, error = %e, "Last.fm: mirror failed"),
        }

        if at > max_seen {
            max_seen = at;
        }
    }

    info!(
        user_id = %row.user_id,
        mirrored,
        skipped_dedup,
        skipped_nowplaying,
        "Last.fm: poll complete"
    );

    db::touch_polled(pool, &row.user_id, Provider::Lastfm, Some(max_seen)).await?;
    Ok(max_seen)
}

fn nonempty(s: Option<String>) -> Option<String> {
    s.filter(|v| !v.trim().is_empty())
}

fn largest_image(images: &Option<Vec<Image>>) -> Option<String> {
    images
        .as_ref()?
        .iter()
        .rev()
        .find(|i| i.text.as_deref().is_some_and(|t| !t.trim().is_empty()))
        .and_then(|i| i.text.clone())
}

#[derive(Debug, Deserialize)]
struct RecentTracksResponse {
    recenttracks: RecentTracks,
}

#[derive(Debug, Deserialize)]
struct RecentTracks {
    track: Option<Vec<TrackItem>>,
}

#[derive(Debug, Deserialize)]
struct TrackItem {
    name: String,
    artist: TextField,
    album: TextField,
    url: Option<String>,
    mbid: Option<String>,
    image: Option<Vec<Image>>,
    date: Option<DateField>,
    #[serde(rename = "@attr")]
    attr: Option<Attr>,
}

#[derive(Debug, Deserialize)]
struct TextField {
    #[serde(rename = "#text")]
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DateField {
    uts: String,
}

#[derive(Debug, Deserialize)]
struct Image {
    #[serde(rename = "#text")]
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Attr {
    nowplaying: Option<String>,
}
