//! Favourites, play state and ratings.
//!
//! Favourites are not a Jellyfin-only concept here: starring a track writes
//! `loved_tracks` and publishes the ATProto like record, exactly as the
//! Subsonic service does, so a heart tapped in Finamp shows up on the user's
//! profile. Everything else lives in this service's own sidecar.
//!
//! Each endpoint is registered twice — the spec form and the legacy
//! `/Users/{userId}/…` one — because clients in the wild still use both. The
//! `userId` in the path is never consulted: a token names exactly one account.

use actix_web::{web, HttpResponse};
use chrono::{DateTime, Utc};
use serde::Deserialize;

use rocksky_navidrome::{api, repo};

use crate::{
    auth::AuthedUser,
    convert::jellyfin_time,
    dto::{UpdateUserItemDataDto, UserItemDataDto},
    guid,
    state::AppState,
    userdata,
};

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct RatingQuery {
    #[serde(alias = "Likes")]
    pub likes: Option<bool>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct PlayedQuery {
    #[serde(alias = "DatePlayed", rename = "datePlayed")]
    pub date_played: Option<String>,
}

/// Resolve a path id to (kind, native id, canonical guid), 404 if unknown.
async fn target(state: &AppState, item_id: &str) -> Option<(String, String, String)> {
    let g = guid::normalize(item_id);
    let (kind, native) = guid::lookup(&state.pool, &g).await?;
    Some((kind, native, g))
}

/// Build the `UserItemDataDto` every one of these endpoints answers with, read
/// back from storage so the client sees what was actually saved.
pub async fn current(
    state: &AppState,
    user: &AuthedUser,
    kind: &str,
    native: &str,
    item_guid: String,
) -> UserItemDataDto {
    let data = userdata::get(&state.pool, &user.id, native).await;
    let is_favorite = kind == guid::KIND_SONG
        && repo::scrobble::is_track_starred(&state.pool, &user.id, native)
            .await
            .unwrap_or(false);

    UserItemDataDto {
        rating: data.rating,
        played_percentage: None,
        unplayed_item_count: None,
        playback_position_ticks: data.playback_position_ticks,
        play_count: data.play_count,
        is_favorite,
        likes: data.likes,
        last_played_date: data.last_played_date.map(jellyfin_time),
        played: data.played,
        key: item_guid.clone(),
        item_id: item_guid,
    }
}

// ── Favourites ──────────────────────────────────────────────────────────────

async fn set_favorite(
    state: &AppState,
    user: &AuthedUser,
    item_id: &str,
    starred: bool,
) -> HttpResponse {
    let Some((kind, native, g)) = target(state, item_id).await else {
        return HttpResponse::NotFound().finish();
    };

    // `loved_tracks` holds tracks and nothing else, and the ATProto like record
    // is about a track too. Starring an album or an artist has nowhere to go, so
    // say so rather than silently dropping it.
    if kind != guid::KIND_SONG {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "Message": "Only songs can be favorited"
        }));
    }

    let result = if starred {
        repo::scrobble::star_track(&state.pool, &user.id, &native).await
    } else {
        repo::scrobble::unstar_track(&state.pool, &user.id, &native).await
    };
    if let Err(e) = result {
        tracing::error!(track = %native, "jellyfin: favorite write failed: {}", e);
        return HttpResponse::InternalServerError().finish();
    }

    publish_like(state, user, &native, starred).await;
    HttpResponse::Ok().json(current(state, user, &kind, &native, g).await)
}

/// Mirror the star onto the user's PDS. Off the request path — the client has
/// its answer either way, and a slow or failing PDS must not make the heart
/// look broken.
async fn publish_like(state: &AppState, user: &AuthedUser, track_id: &str, starred: bool) {
    let pool = state.pool.clone();
    let user_id = user.id.clone();
    let track_id = track_id.to_string();
    tokio::spawn(async move {
        let did = match repo::user::get_user_did_by_id(&pool, &user_id).await {
            Ok(Some(d)) => d,
            Ok(None) => {
                tracing::warn!(user_id, "jellyfin: no DID, like not published");
                return;
            }
            Err(e) => {
                tracing::warn!(user_id, "jellyfin: DID lookup failed: {}", e);
                return;
            }
        };

        let track = match repo::track::get_track_by_id(&pool, &track_id, &user_id).await {
            Ok(Some(t)) => t,
            _ => {
                tracing::warn!(track_id, "jellyfin: track missing, like not published");
                return;
            }
        };

        if starred {
            api::post_like(did, track).await;
        } else {
            // The like record is addressed by the track's content hash, built
            // the same way the API builds it.
            use sha2::{Digest, Sha256};
            let input = format!(
                "{} - {} - {}",
                track.title.to_lowercase(),
                track.artist.to_lowercase(),
                track.album.to_lowercase()
            );
            let sha256 = hex::encode(Sha256::digest(input.as_bytes()));
            api::delete_like(did, sha256).await;
        }
    });
}

pub async fn add_favorite(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    set_favorite(&state, &user, &path.into_inner(), true).await
}

pub async fn remove_favorite(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    set_favorite(&state, &user, &path.into_inner(), false).await
}

pub async fn add_favorite_legacy(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
) -> HttpResponse {
    let (_uid, item) = path.into_inner();
    set_favorite(&state, &user, &item, true).await
}

pub async fn remove_favorite_legacy(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
) -> HttpResponse {
    let (_uid, item) = path.into_inner();
    set_favorite(&state, &user, &item, false).await
}

// ── UserData ────────────────────────────────────────────────────────────────

pub async fn get_user_data(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    match target(&state, &path.into_inner()).await {
        Some((kind, native, g)) => {
            HttpResponse::Ok().json(current(&state, &user, &kind, &native, g).await)
        }
        None => HttpResponse::NotFound().finish(),
    }
}

pub async fn get_user_data_legacy(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
) -> HttpResponse {
    let (_uid, item) = path.into_inner();
    get_user_data(user, state, web::Path::from(item)).await
}

pub async fn update_user_data(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
    body: Option<web::Json<UpdateUserItemDataDto>>,
) -> HttpResponse {
    let Some((kind, native, g)) = target(&state, &path.into_inner()).await else {
        return HttpResponse::NotFound().finish();
    };
    apply(
        &state,
        &user,
        &kind,
        &native,
        body.map(web::Json::into_inner),
    )
    .await;
    HttpResponse::Ok().json(current(&state, &user, &kind, &native, g).await)
}

pub async fn update_user_data_legacy(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
    body: Option<web::Json<UpdateUserItemDataDto>>,
) -> HttpResponse {
    let (_uid, item) = path.into_inner();
    update_user_data(user, state, web::Path::from(item), body).await
}

async fn apply(
    state: &AppState,
    user: &AuthedUser,
    kind: &str,
    native: &str,
    body: Option<UpdateUserItemDataDto>,
) {
    let Some(body) = body else { return };
    let pool = &state.pool;
    let uid = &user.id;

    if let Some(ticks) = body.playback_position_ticks {
        let _ = userdata::set_position(pool, uid, native, ticks).await;
    }
    if let Some(count) = body.play_count {
        let _ = userdata::set_play_count(pool, uid, native, count).await;
    }
    if let Some(played) = body.played {
        let _ = userdata::set_played_flag(pool, uid, native, played).await;
    }
    if let Some(likes) = body.likes {
        let _ = userdata::set_likes(pool, uid, native, Some(likes)).await;
    }
    if let Some(rating) = body.rating {
        let _ = userdata::set_rating(pool, uid, native, Some(rating)).await;
    }
    if let Some(date) = body.last_played_date.as_deref().and_then(parse_date) {
        let _ = userdata::set_last_played(pool, uid, native, Some(date)).await;
    }
    if let Some(fav) = body.is_favorite {
        if kind == guid::KIND_SONG {
            let result = if fav {
                repo::scrobble::star_track(pool, uid, native).await
            } else {
                repo::scrobble::unstar_track(pool, uid, native).await
            };
            if result.is_ok() {
                publish_like(state, user, native, fav).await;
            }
        }
    }
}

/// Clients send timestamps in a few shapes; the reference server's own naive
/// form has no offset at all, so try that before giving up.
fn parse_date(raw: &str) -> Option<DateTime<Utc>> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(raw) {
        return Some(dt.with_timezone(&Utc));
    }
    chrono::NaiveDateTime::parse_from_str(raw, "%Y-%m-%dT%H:%M:%S%.f")
        .ok()
        .map(|naive| naive.and_utc())
}

// ── Played / rating ─────────────────────────────────────────────────────────

pub async fn mark_played(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
    query: web::Query<PlayedQuery>,
) -> HttpResponse {
    let Some((kind, native, g)) = target(&state, &path.into_inner()).await else {
        return HttpResponse::NotFound().finish();
    };
    let at = query
        .into_inner()
        .date_played
        .as_deref()
        .and_then(parse_date);
    if let Err(e) = userdata::set_played(&state.pool, &user.id, &native, true, at).await {
        tracing::error!(track = %native, "jellyfin: mark played failed: {}", e);
        return HttpResponse::InternalServerError().finish();
    }
    HttpResponse::Ok().json(current(&state, &user, &kind, &native, g).await)
}

pub async fn mark_unplayed(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let Some((kind, native, g)) = target(&state, &path.into_inner()).await else {
        return HttpResponse::NotFound().finish();
    };
    if let Err(e) = userdata::set_played(&state.pool, &user.id, &native, false, None).await {
        tracing::error!(track = %native, "jellyfin: mark unplayed failed: {}", e);
        return HttpResponse::InternalServerError().finish();
    }
    HttpResponse::Ok().json(current(&state, &user, &kind, &native, g).await)
}

pub async fn mark_played_legacy(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
    query: web::Query<PlayedQuery>,
) -> HttpResponse {
    let (_uid, item) = path.into_inner();
    mark_played(user, state, web::Path::from(item), query).await
}

pub async fn mark_unplayed_legacy(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
) -> HttpResponse {
    let (_uid, item) = path.into_inner();
    mark_unplayed(user, state, web::Path::from(item)).await
}

pub async fn set_rating(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
    query: web::Query<RatingQuery>,
) -> HttpResponse {
    let Some((kind, native, g)) = target(&state, &path.into_inner()).await else {
        return HttpResponse::NotFound().finish();
    };
    let likes = query.into_inner().likes;
    if let Err(e) = userdata::set_likes(&state.pool, &user.id, &native, likes).await {
        tracing::error!(item = %native, "jellyfin: set rating failed: {}", e);
        return HttpResponse::InternalServerError().finish();
    }
    HttpResponse::Ok().json(current(&state, &user, &kind, &native, g).await)
}

pub async fn clear_rating(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let Some((kind, native, g)) = target(&state, &path.into_inner()).await else {
        return HttpResponse::NotFound().finish();
    };
    if let Err(e) = userdata::set_likes(&state.pool, &user.id, &native, None).await {
        tracing::error!(item = %native, "jellyfin: clear rating failed: {}", e);
        return HttpResponse::InternalServerError().finish();
    }
    HttpResponse::Ok().json(current(&state, &user, &kind, &native, g).await)
}

pub async fn set_rating_legacy(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
    query: web::Query<RatingQuery>,
) -> HttpResponse {
    let (_uid, item) = path.into_inner();
    set_rating(user, state, web::Path::from(item), query).await
}

pub async fn clear_rating_legacy(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
) -> HttpResponse {
    let (_uid, item) = path.into_inner();
    clear_rating(user, state, web::Path::from(item)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rfc3339_and_the_naive_jellyfin_form() {
        assert!(parse_date("2026-01-02T03:04:05Z").is_some());
        assert!(parse_date("2026-01-02T03:04:05.1234567").is_some());
        assert!(parse_date("not a date").is_none());
    }
}
