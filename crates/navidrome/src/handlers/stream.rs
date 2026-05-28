use actix_web::{web::Bytes, HttpResponse};
use futures::{stream, StreamExt};
use sqlx::{Pool, Postgres};
use std::{env, sync::Arc};

use crate::{repo, response, s3, xata::track::TrackWithUpload};

async fn resolve_url(track: &TrackWithUpload) -> Result<String, anyhow::Error> {
    if track.storage_provider_id.is_none() {
        return Ok(s3::public_url(&track.r2_key));
    }

    if let Some(ref pub_url) = track.storage_public_url {
        let key = track.r2_key.trim_start_matches('/');
        return Ok(format!("{}/{}", pub_url.trim_end_matches('/'), key));
    }

    let enc_key = env::var("STORAGE_ENCRYPTION_KEY").unwrap_or_else(|_| "0".repeat(64));

    let access_key = s3::decrypt_credential(
        track.storage_access_key.as_deref().unwrap_or_default(),
        &enc_key,
    )?;
    let secret_key = s3::decrypt_credential(
        track.storage_secret_key.as_deref().unwrap_or_default(),
        &enc_key,
    )?;

    s3::presign_get_with_creds(
        &track.r2_key,
        track.storage_endpoint.as_deref().unwrap_or_default(),
        track.storage_region.as_deref().unwrap_or("auto"),
        track.storage_bucket.as_deref().unwrap_or_default(),
        &access_key,
        &secret_key,
        3600,
    )
    .await
}

pub async fn handle_head(
    format: &str,
    user_id: &str,
    song_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    let track = match repo::track::get_track_by_id(pool, song_id, user_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return response::err(format, 70, "Song not found"),
        Err(e) => {
            tracing::error!("stream HEAD lookup error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    };

    let url = match resolve_url(&track).await {
        Ok(u) => u,
        Err(e) => {
            tracing::error!("stream HEAD url resolve error: {}", e);
            return response::err(format, 0, "Failed to resolve audio URL");
        }
    };

    let client = reqwest::Client::new();

    let upstream = match client.head(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("stream HEAD fetch error: {}", e);
            return response::err(format, 0, "Failed to fetch audio metadata");
        }
    };

    let status = actix_web::http::StatusCode::from_u16(upstream.status().as_u16())
        .unwrap_or(actix_web::http::StatusCode::OK);

    let mut builder = HttpResponse::build(status);
    builder.append_header(("Access-Control-Allow-Origin", "*"));
    builder.append_header(("Accept-Ranges", "bytes"));

    if let Some(val) = upstream.headers().get("Content-Type") {
        if let Ok(s) = val.to_str() {
            builder.append_header(("Content-Type", s));
        }
    }

    // SizedStream declares the Content-Length at the body level, which actix
    // uses when serializing headers. finish() / no_chunking() both lose because
    // actix overwrites Content-Length from the actual body size (0) afterwards.
    if let Some(val) = upstream.headers().get("Content-Length") {
        if let Ok(s) = val.to_str() {
            if let Ok(len) = s.parse::<u64>() {
                return builder.body(actix_web::body::SizedStream::new(
                    len,
                    stream::empty::<Result<Bytes, std::io::Error>>(),
                ));
            }
        }
    }

    builder.finish()
}

pub async fn handle(
    format: &str,
    user_id: &str,
    song_id: &str,
    pool: &Arc<Pool<Postgres>>,
    range: Option<&str>,
    nc: &Arc<async_nats::Client>,
    emit_status: bool,
) -> HttpResponse {
    let track = match repo::track::get_track_by_id(pool, song_id, user_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return response::err(format, 70, "Song not found"),
        Err(e) => {
            tracing::error!("stream lookup error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    };

    // Publish song.changed when streaming starts from the beginning.
    // Clients that don't call updateNowPlaying or scrobble?submission=false
    // always hit this endpoint, so it's the reliable trigger for status updates.
    if emit_status {
        let is_start = range.map(|r| r.starts_with("bytes=0-")).unwrap_or(true);
        if is_start {
            tracing::info!(user_id, song_id, "stream started, publishing song.changed");
            super::scrobble::publish_song_changed(pool, nc, user_id, song_id).await;
        }
    }

    let url = match resolve_url(&track).await {
        Ok(u) => u,
        Err(e) => {
            tracing::error!("stream url resolve error: {}", e);
            return response::err(format, 0, "Failed to resolve audio URL");
        }
    };

    let client = reqwest::Client::new();
    let mut req = client.get(&url);
    if let Some(range_val) = range {
        req = req.header("Range", range_val);
    }

    let upstream = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("stream fetch error: {}", e);
            return response::err(format, 0, "Failed to fetch audio");
        }
    };

    let status = actix_web::http::StatusCode::from_u16(upstream.status().as_u16())
        .unwrap_or(actix_web::http::StatusCode::OK);

    let mut builder = HttpResponse::build(status);
    builder.append_header(("Access-Control-Allow-Origin", "*"));
    builder.append_header(("Cache-Control", "no-cache"));

    let mut content_length: Option<u64> = None;
    for header_name in &[
        "Content-Type",
        "Content-Length",
        "Content-Range",
        "Accept-Ranges",
    ] {
        if let Some(val) = upstream.headers().get(*header_name) {
            if let Ok(s) = val.to_str() {
                if *header_name == "Content-Length" {
                    content_length = s.parse().ok();
                }
                builder.append_header((*header_name, s));
            }
        }
    }

    let stream = upstream.bytes_stream().map(|chunk| {
        chunk.map_err(|e| {
            let io_err: std::io::Error =
                std::io::Error::new(std::io::ErrorKind::Other, e.to_string());
            io_err
        })
    });

    if let Some(len) = content_length {
        builder.body(actix_web::body::SizedStream::new(len, stream))
    } else {
        builder.streaming(stream)
    }
}
