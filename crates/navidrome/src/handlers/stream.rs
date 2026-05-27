use actix_web::HttpResponse;
use futures::StreamExt;
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use crate::{repo, response, s3};

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

    let url = s3::public_url(&track.r2_key);
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
