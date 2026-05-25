use actix_web::HttpResponse;
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use crate::{repo, response, s3};

pub async fn handle(
    format: &str,
    user_id: &str,
    song_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    let track = match repo::track::get_track_by_id(pool, song_id, user_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return response::err(format, 70, "Song not found"),
        Err(e) => {
            tracing::error!("stream lookup error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    };

    let url = s3::public_url(&track.r2_key);
    HttpResponse::TemporaryRedirect()
        .append_header(("Location", url))
        .append_header(("Cache-Control", "no-cache"))
        .finish()
}
