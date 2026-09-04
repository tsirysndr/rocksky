//! Playback reporting.
//!
//! `POST /Sessions/Playing` is the Jellyfin equivalent of Subsonic's
//! `updateNowPlaying`, and it feeds the same place: a `rocksky.song.changed`
//! message on NATS, which is what drives now-playing and the scrobble pipeline
//! downstream. Progress reports only move the resume position; the stop report
//! marks the track played.

use actix_web::{web, HttpResponse};
use chrono::Utc;
use serde_json::Value;

use rocksky_navidrome::{handlers::scrobble::publish_song_changed, repo};

use crate::{auth::AuthedUser, dto::TICKS_PER_MS, guid, state::AppState, userdata};

/// `GET /Sessions` — clients poll this for remote-control targets. This service
/// controls nothing, so the list is always empty; answering keeps them polling
/// cleanly instead of retrying a 404.
pub async fn sessions_list(_user: AuthedUser) -> HttpResponse {
    HttpResponse::Ok().json(Vec::<Value>::new())
}

pub async fn sessions_capabilities(_user: AuthedUser) -> HttpResponse {
    HttpResponse::NoContent().finish()
}

pub async fn playing(
    user: AuthedUser,
    state: web::Data<AppState>,
    body: web::Json<Value>,
) -> HttpResponse {
    let body = body.into_inner();
    let Some((track_id, _)) = report(&state, &body).await else {
        return HttpResponse::NoContent().finish();
    };

    if repo::track::get_track_by_id(&state.pool, &track_id, &user.id)
        .await
        .ok()
        .flatten()
        .is_none()
    {
        tracing::warn!(
            track_id,
            "jellyfin: now-playing for a track outside the library"
        );
        return HttpResponse::NoContent().finish();
    }

    if let Some(nc) = &state.nc {
        publish_song_changed(&state.pool, nc, &user.id, &track_id).await;
    }
    HttpResponse::NoContent().finish()
}

pub async fn progress(
    user: AuthedUser,
    state: web::Data<AppState>,
    body: web::Json<Value>,
) -> HttpResponse {
    let body = body.into_inner();
    if let Some((track_id, ticks)) = report(&state, &body).await {
        if let Err(e) = userdata::set_position(&state.pool, &user.id, &track_id, ticks).await {
            tracing::warn!(track_id, "jellyfin: could not save resume position: {}", e);
        }
    }
    HttpResponse::NoContent().finish()
}

pub async fn stopped(
    user: AuthedUser,
    state: web::Data<AppState>,
    body: web::Json<Value>,
) -> HttpResponse {
    let body = body.into_inner();
    let Some((track_id, ticks)) = report(&state, &body).await else {
        return HttpResponse::NoContent().finish();
    };

    let Ok(Some(track)) = repo::track::get_track_by_id(&state.pool, &track_id, &user.id).await
    else {
        return HttpResponse::NoContent().finish();
    };

    // Last.fm's rule, the same one every scrobbler uses: half the track, or four
    // minutes, whichever comes first.
    let position_ms = ticks / TICKS_PER_MS;
    let duration_ms = track.duration as i64;
    let listened = position_ms >= (duration_ms / 2).min(4 * 60 * 1000) && duration_ms > 0;

    tracing::info!(
        track = %track.title,
        position_ms,
        duration_ms,
        listened,
        "jellyfin: playback stopped"
    );

    if listened {
        if let Err(e) =
            userdata::set_played(&state.pool, &user.id, &track_id, true, Some(Utc::now())).await
        {
            tracing::warn!(track_id, "jellyfin: could not mark played: {}", e);
        }
    }
    // Either way the resume point goes away — a stopped track is not a
    // partially-played one as far as the next client is concerned.
    if let Err(e) = userdata::set_position(&state.pool, &user.id, &track_id, 0).await {
        tracing::warn!(track_id, "jellyfin: could not clear resume position: {}", e);
    }

    HttpResponse::NoContent().finish()
}

/// Pull `(native track id, position ticks)` out of a playback report. Clients
/// disagree on the casing of both keys.
async fn report(state: &AppState, body: &Value) -> Option<(String, i64)> {
    let item_id = body
        .get("ItemId")
        .and_then(Value::as_str)
        .or_else(|| body.get("itemId").and_then(Value::as_str))?;
    let ticks = body
        .get("PositionTicks")
        .and_then(Value::as_i64)
        .or_else(|| body.get("positionTicks").and_then(Value::as_i64))
        .unwrap_or(0);

    match guid::lookup(&state.pool, item_id).await {
        Some((kind, native)) if kind == guid::KIND_SONG => Some((native, ticks)),
        Some((kind, _)) => {
            tracing::debug!(item_id, kind, "jellyfin: playback report is not for a song");
            None
        }
        None => {
            tracing::warn!(item_id, "jellyfin: playback report for an unknown item");
            None
        }
    }
}
