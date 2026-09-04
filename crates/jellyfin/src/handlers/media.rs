//! Cover art and audio delivery.
//!
//! Neither is served from this process. Uploads live in object storage (or the
//! user's own BYO bucket) and cover art on the CDN, so both endpoints resolve a
//! URL and hand the client a redirect — range requests, seeking and edge
//! caching are then the origin's job, exactly as in the Subsonic service.

use actix_web::{web, HttpRequest, HttpResponse};
use rocksky_navidrome::{handlers::stream::resolve_track_url, repo};

use crate::{
    auth::{self, AuthedUser},
    convert::Ctx,
    dto::PlaybackInfoResponse,
    guid,
    state::AppState,
};

// ── Images ──────────────────────────────────────────────────────────────────

/// Cover art for any item id: album art for an album, the track's own art (or
/// its album's) for a song, and the artist picture for an artist.
///
/// Unauthenticated on purpose. Clients load these from plain `<img>` tags with
/// no headers attached, and every URL this resolves to is a public CDN link —
/// the redirect gives away nothing the target didn't already publish.
async fn art_url(state: &AppState, item_id: &str) -> Option<String> {
    let (kind, native) = guid::lookup(&state.pool, item_id).await?;
    let pool = &state.pool;

    match kind.as_str() {
        "album" => repo::album::get_album_art(pool, &native)
            .await
            .ok()
            .flatten(),
        "artist" => repo::artist::get_picture_by_artist_id(pool, &native)
            .await
            .ok()
            .flatten(),
        "song" => {
            if let Some(art) = repo::track::get_album_art_by_track_id(pool, &native)
                .await
                .ok()
                .flatten()
            {
                return Some(art);
            }
            let album_id = repo::track::get_album_id_for_track(pool, &native)
                .await
                .ok()
                .flatten()?;
            repo::album::get_album_art(pool, &album_id)
                .await
                .ok()
                .flatten()
        }
        // A playlist tile is a mosaic client-side; the first cover in it is the
        // closest single image we have.
        "playlist" => crate::library::playlist_cover(pool, &native).await,
        _ => None,
    }
}

pub async fn item_image(
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
) -> HttpResponse {
    let (item_id, _kind) = path.into_inner();
    redirect_to_art(&state, &item_id).await
}

pub async fn item_image_by_index(
    state: web::Data<AppState>,
    path: web::Path<(String, String, String)>,
) -> HttpResponse {
    let (item_id, _kind, _index) = path.into_inner();
    redirect_to_art(&state, &item_id).await
}

async fn redirect_to_art(state: &AppState, item_id: &str) -> HttpResponse {
    match art_url(state, item_id).await {
        Some(url) => HttpResponse::TemporaryRedirect()
            .append_header(("Location", url))
            .append_header(("Access-Control-Allow-Origin", "*"))
            .finish(),
        None => HttpResponse::NotFound().finish(),
    }
}

// ── Playback ────────────────────────────────────────────────────────────────

/// `/Items/{id}/PlaybackInfo` — the client asks what it may play and how.
/// The answer is always "the original file, direct play": we never transcode.
pub async fn playback_info(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let ctx = Ctx::new(&state, &user);
    let id = path.into_inner();

    let Some((kind, native)) = guid::lookup(&state.pool, &id).await else {
        return HttpResponse::NotFound().finish();
    };
    if kind != "song" {
        return HttpResponse::BadRequest().finish();
    }
    let Ok(Some(track)) = repo::track::get_track_by_id(&state.pool, &native, &user.id).await else {
        return HttpResponse::NotFound().finish();
    };

    let dto = crate::convert::song_to_item(&ctx, &track).await;
    HttpResponse::Ok().json(PlaybackInfoResponse {
        media_sources: dto.media_sources.unwrap_or_default(),
        play_session_id: Some(auth::random_hex(8)),
    })
}

// ── Streaming ───────────────────────────────────────────────────────────────

/// Resolve the object URL and redirect. Streaming endpoints are authorized
/// here rather than through the extractor because clients pass the token as
/// `?api_key=` on these URLs and send no headers at all.
async fn stream(state: &AppState, req: &HttpRequest, id: &str) -> HttpResponse {
    let Some(user) = auth::authorize(req, state).await else {
        return HttpResponse::Unauthorized().finish();
    };

    let Some((kind, native)) = guid::lookup(&state.pool, id).await else {
        return HttpResponse::NotFound().finish();
    };
    if kind != "song" {
        return HttpResponse::BadRequest().finish();
    }

    let track = match repo::track::get_track_by_id(&state.pool, &native, &user.id).await {
        Ok(Some(t)) => t,
        Ok(None) => return HttpResponse::NotFound().finish(),
        Err(e) => {
            tracing::error!("jellyfin: stream lookup failed: {}", e);
            return HttpResponse::InternalServerError().finish();
        }
    };

    match resolve_track_url(&track).await {
        Ok(url) => HttpResponse::Found()
            .append_header(("Location", url))
            .append_header(("Access-Control-Allow-Origin", "*"))
            .append_header(("Cache-Control", "no-cache"))
            .finish(),
        Err(e) => {
            tracing::error!("jellyfin: could not resolve audio URL: {}", e);
            HttpResponse::InternalServerError().finish()
        }
    }
}

pub async fn audio_stream(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    stream(&state, &req, &path.into_inner()).await
}

/// `/Audio/{id}/stream.{ext}` — the extension is decoration; the object store
/// serves whatever the upload actually is.
pub async fn audio_stream_ext(
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
    req: HttpRequest,
) -> HttpResponse {
    let (id, _ext) = path.into_inner();
    stream(&state, &req, &id).await
}

pub async fn audio_universal(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    stream(&state, &req, &path.into_inner()).await
}

/// `/Items/{id}/File` and `/Items/{id}/Download` — how Finamp and anything on
/// just_audio fetch the original file for offline playback.
pub async fn item_file(
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    stream(&state, &req, &path.into_inner()).await
}
