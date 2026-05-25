use actix_web::HttpResponse;
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use crate::{repo, response};

/// Returns album art for a track: uses the track's own album_art field first,
/// then falls back to the art of the album the track belongs to.
async fn art_for_track(pool: &Pool<Postgres>, track_id: &str) -> Option<String> {
    let direct = repo::track::get_album_art_by_track_id(pool, track_id)
        .await
        .ok()
        .flatten();
    if direct.is_some() {
        return direct;
    }
    let album_id = repo::track::get_album_id_for_track(pool, track_id)
        .await
        .ok()
        .flatten()?;
    repo::album::get_album_art(pool, &album_id)
        .await
        .ok()
        .flatten()
}

pub async fn handle(format: &str, cover_id: &str, pool: &Arc<Pool<Postgres>>) -> HttpResponse {
    let url = if let Some(album_id) = cover_id.strip_prefix("al-") {
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
        art_for_track(pool, track_id).await
    } else {
        // No prefix: try track → album → artist.
        let by_track = art_for_track(pool, cover_id).await;
        if by_track.is_some() {
            by_track
        } else {
            let by_album = repo::album::get_album_art(pool, cover_id)
                .await
                .ok()
                .flatten();
            if by_album.is_some() {
                by_album
            } else {
                repo::artist::get_picture_by_artist_id(pool, cover_id)
                    .await
                    .ok()
                    .flatten()
            }
        }
    };

    match url {
        Some(u) => HttpResponse::TemporaryRedirect()
            .append_header(("Location", u))
            .finish(),
        None => response::err(format, 70, "Cover art not found"),
    }
}
