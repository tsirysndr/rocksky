use actix_web::HttpResponse;
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use crate::{repo, response, s3};

pub async fn handle(format: &str, cover_id: &str, pool: &Arc<Pool<Postgres>>) -> HttpResponse {
    let image_url = if let Some(album_id) = cover_id.strip_prefix("al-") {
        repo::album::get_album_art(pool, album_id)
            .await
            .ok()
            .flatten()
    } else if let Some(artist_id) = cover_id.strip_prefix("ar-") {
        repo::artist::get_picture_by_artist_id(pool, artist_id)
            .await
            .ok()
            .flatten()
    } else if let Some(track_id) = cover_id.strip_prefix("tr-") {
        repo::track::get_album_art_by_track_id(pool, track_id)
            .await
            .ok()
            .flatten()
    } else {
        // Try track first, then album
        let by_track = repo::track::get_album_art_by_track_id(pool, cover_id)
            .await
            .ok()
            .flatten();
        if by_track.is_some() {
            by_track
        } else {
            repo::album::get_album_art(pool, cover_id)
                .await
                .ok()
                .flatten()
        }
    };

    match image_url {
        Some(url) if url.starts_with("http://") || url.starts_with("https://") => {
            HttpResponse::TemporaryRedirect()
                .append_header(("Location", url))
                .finish()
        }
        Some(key) => {
            // Treat as an S3/R2 key
            match s3::presign_get(&key, 3600).await {
                Ok(url) => HttpResponse::TemporaryRedirect()
                    .append_header(("Location", url))
                    .finish(),
                Err(e) => {
                    tracing::error!("coverArt presign error: {}", e);
                    response::err(format, 70, "Cover art not found")
                }
            }
        }
        None => response::err(format, 70, "Cover art not found"),
    }
}
