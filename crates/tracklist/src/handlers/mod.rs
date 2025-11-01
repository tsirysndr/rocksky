use crate::handlers::tracklist::*;
use actix_web::{HttpRequest, HttpResponse, web};
use anyhow::Error;
use std::sync::Arc;

pub mod tracklist;

#[macro_export]
macro_rules! read_payload {
    ($payload:expr) => {{
        let mut body = Vec::new();
        while let Some(chunk) = $payload.next().await {
            // skip if None
            match chunk {
                Ok(bytes) => body.extend_from_slice(&bytes),
                Err(err) => return Err(err.into()),
            }
        }
        body
    }};
}

pub async fn handle(
    method: &str,
    payload: &mut web::Payload,
    req: &HttpRequest,
    conn: Arc<redis::Client>,
) -> Result<HttpResponse, Error> {
    match method {
        "tracklist.addTrack" => add_track(payload, req, conn.clone()).await,
        "tracklist.insertTrackAt" => insert_track_at(payload, req, conn.clone()).await,
        "tracklist.removeTrackAt" => remove_track_at(payload, req, conn.clone()).await,
        "tracklist.shuffleQueue" => shuffle_queue(payload, req, conn.clone()).await,
        "tracklist.getQueue" => get_queue(payload, req, conn.clone()).await,
        "tracklist.clearQueue" => clear_queue(payload, req, conn.clone()).await,
        "tracklist.getQueueLength" => get_queue_length(payload, req, conn.clone()).await,
        "tracklist.isQueueEmpty" => is_queue_empty(payload, req, conn.clone()).await,
        "tracklist.setCurrentTrack" => set_current_track(payload, req, conn.clone()).await,
        "tracklist.getCurrentTrack" => get_current_track(payload, req, conn.clone()).await,
        "tracklist.clearCurrentTrack" => clear_current_track(payload, req, conn.clone()).await,
        "tracklist.moveTrack" => move_track(payload, req, conn.clone()).await,
        "tracklist.replaceQueue" => replace_queue(payload, req, conn.clone()).await,
        "tracklist.getTrackAt" => get_track_at(payload, req, conn.clone()).await,
        "tracklist.insertTracksAt" => insert_tracks_at(payload, req, conn.clone()).await,
        _ => return Err(anyhow::anyhow!("Method not found")),
    }
}
