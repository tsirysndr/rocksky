//! Playlists.
//!
//! Backed by the same `navidrome_playlists` tables the Subsonic service writes,
//! so a playlist made in one client shows up in the other — and gets mirrored
//! to the user's PDS by the same pipeline.

use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;
use serde_json::{json, Value};

use rocksky_navidrome::repo;

use crate::{
    auth::AuthedUser,
    convert::{self, Ctx},
    dto::{ItemsResult, PlaylistCreationResult},
    guid,
    query::{self},
    state::AppState,
};

/// A playlist entry is addressed by its position, not by the song it holds: the
/// same song can appear twice, and remove/move have to tell the two apart.
/// Clients round-trip this as `PlaylistItemId` / `EntryIds`.
pub fn entry_guid(playlist_id: &str, position: i64) -> String {
    guid::guid("playlist_entry", &format!("{playlist_id}:{position}"))
}

/// Turn the `EntryIds` a client sent back into positions in this playlist.
/// Unknown ids are dropped rather than guessed at.
async fn positions_for(
    state: &AppState,
    user: &AuthedUser,
    playlist_id: &str,
    entry_ids: &str,
) -> Vec<i64> {
    let Ok(Some((_, tracks))) =
        repo::playlist::get_playlist(&state.pool, playlist_id, &user.id).await
    else {
        return vec![];
    };

    let wanted: Vec<String> = query::split_ids(entry_ids)
        .into_iter()
        .map(guid::normalize)
        .collect();

    let mut positions: Vec<i64> = Vec::new();
    for index in 0..tracks.len() as i64 {
        let entry = entry_guid(playlist_id, index);
        if wanted.iter().any(|w| *w == entry) {
            positions.push(index);
        }
    }

    // Some clients pass song ids here instead of entry ids; fall back to
    // matching those so "remove from playlist" still works.
    if positions.is_empty() {
        for (index, track) in tracks.iter().enumerate() {
            let song = guid::guid(guid::KIND_SONG, &track.xata_id);
            if wanted.iter().any(|w| *w == song) {
                positions.push(index as i64);
            }
        }
    }
    positions
}

async fn owned(state: &AppState, user: &AuthedUser, playlist_id: &str) -> bool {
    repo::playlist::is_owner(&state.pool, playlist_id, &user.id)
        .await
        .unwrap_or(false)
}

/// Resolve a path id to the native playlist id it names.
async fn native_playlist(state: &AppState, id: &str) -> Option<String> {
    match guid::lookup(&state.pool, id).await {
        Some((kind, native)) if kind == guid::KIND_PLAYLIST => Some(native),
        _ => None,
    }
}

// ── Read ────────────────────────────────────────────────────────────────────

pub async fn playlists_list(
    user: AuthedUser,
    state: web::Data<AppState>,
    req: HttpRequest,
) -> HttpResponse {
    let q = query::parse(&req);
    let ctx = Ctx::new(&state, &user);
    let rows = repo::playlist::get_playlists(&state.pool, &user.id)
        .await
        .unwrap_or_default();
    let total = rows.len() as i32;
    let offset = q.offset();
    let slice: Vec<_> = rows
        .into_iter()
        .skip(offset as usize)
        .take(q.limit_or(500) as usize)
        .collect();
    let dtos = convert::playlists_to_items(&ctx, &slice).await;
    HttpResponse::Ok().json(ItemsResult::new(dtos, total, offset))
}

pub async fn get_playlist(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let ctx = Ctx::new(&state, &user);
    match super::items::item_dto(&ctx, &path.into_inner()).await {
        Some(dto) if dto.item_type == "Playlist" => HttpResponse::Ok().json(dto),
        _ => HttpResponse::NotFound().finish(),
    }
}

pub async fn playlist_items(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let ctx = Ctx::new(&state, &user);
    match native_playlist(&state, &path.into_inner()).await {
        Some(native) => super::items::playlist_songs(&ctx, &native).await,
        None => HttpResponse::NotFound().finish(),
    }
}

/// `/Playlists/{id}/Users` — sharing isn't modelled, so a playlist has no other
/// users. Routed so clients stop retrying it on the detail page.
pub async fn playlist_users(_user: AuthedUser, _path: web::Path<String>) -> HttpResponse {
    HttpResponse::Ok().json(Vec::<Value>::new())
}

// ── Write ───────────────────────────────────────────────────────────────────

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "PascalCase")]
pub struct CreatePlaylistBody {
    pub name: Option<String>,
    pub ids: Option<Vec<String>>,
    pub item_ids: Option<Vec<String>>,
    pub user_id: Option<String>,
    pub media_type: Option<String>,
}

pub async fn create_playlist(
    user: AuthedUser,
    state: web::Data<AppState>,
    req: HttpRequest,
    body: Option<web::Json<CreatePlaylistBody>>,
) -> HttpResponse {
    let params = query::collect(&req);
    let one = |k: &str, alt: &str| {
        params
            .get(k)
            .or_else(|| params.get(alt))
            .and_then(|v| v.first())
            .cloned()
    };

    let body = body.map(web::Json::into_inner).unwrap_or_default();
    let name = body
        .name
        .or_else(|| one("name", "Name"))
        .unwrap_or_else(|| "New Playlist".to_string());

    let playlist_id =
        match repo::playlist::create_playlist(&state.pool, &user.id, &name, None).await {
            Ok(id) => id,
            Err(e) => {
                tracing::error!("jellyfin: create playlist failed: {}", e);
                return HttpResponse::InternalServerError().finish();
            }
        };

    // The initial track list arrives as a JSON array in the body or as a CSV in
    // the query string, depending on the client.
    let mut seeds: Vec<String> = body.ids.unwrap_or_default();
    seeds.extend(body.item_ids.unwrap_or_default());
    if seeds.is_empty() {
        if let Some(csv) = one("ids", "Ids") {
            seeds.extend(query::split_ids(&csv).into_iter().map(str::to_string));
        }
    }
    add_songs(&state, &playlist_id, &seeds).await;

    HttpResponse::Ok().json(PlaylistCreationResult {
        id: guid::remember(&state.pool, guid::KIND_PLAYLIST, &playlist_id).await,
    })
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "PascalCase")]
pub struct UpdatePlaylistBody {
    pub name: Option<String>,
    pub ids: Option<Vec<String>>,
}

pub async fn update_playlist(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
    body: Option<web::Json<UpdatePlaylistBody>>,
) -> HttpResponse {
    let Some(native) = native_playlist(&state, &path.into_inner()).await else {
        return HttpResponse::NotFound().finish();
    };
    if !owned(&state, &user, &native).await {
        return HttpResponse::Forbidden().finish();
    }

    let body = body.map(web::Json::into_inner).unwrap_or_default();
    if let Some(name) = body.name.filter(|n| !n.is_empty()) {
        if let Err(e) = repo::playlist::update_meta(&state.pool, &native, Some(&name), None).await {
            tracing::error!("jellyfin: rename playlist failed: {}", e);
            return HttpResponse::InternalServerError().finish();
        }
    }
    HttpResponse::NoContent().finish()
}

pub async fn add_playlist_items(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    let Some(native) = native_playlist(&state, &path.into_inner()).await else {
        return HttpResponse::NotFound().finish();
    };
    if !owned(&state, &user, &native).await {
        return HttpResponse::Forbidden().finish();
    }

    let params = query::collect(&req);
    let ids: Vec<String> = params
        .get("ids")
        .or_else(|| params.get("Ids"))
        .map(|v| {
            v.iter()
                .flat_map(|s| query::split_ids(s).into_iter().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    add_songs(&state, &native, &ids).await;
    HttpResponse::NoContent().finish()
}

/// Append song ids to a playlist, one at a time and in order — the entry order
/// is what the playlist shows, so a concurrent add would interleave.
async fn add_songs(state: &AppState, playlist_id: &str, ids: &[String]) {
    for raw in ids {
        let Some((kind, native)) = guid::lookup(&state.pool, raw).await else {
            continue;
        };
        if kind != guid::KIND_SONG {
            continue;
        }
        if let Err(e) = repo::playlist::add_track(&state.pool, playlist_id, &native).await {
            tracing::warn!(playlist_id, track = %native, "jellyfin: add to playlist failed: {}", e);
        }
    }
}

pub async fn remove_playlist_items(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    let Some(native) = native_playlist(&state, &path.into_inner()).await else {
        return HttpResponse::NotFound().finish();
    };
    if !owned(&state, &user, &native).await {
        return HttpResponse::Forbidden().finish();
    }

    let params = query::collect(&req);
    let entry_ids = params
        .get("entryIds")
        .or_else(|| params.get("EntryIds"))
        .or_else(|| params.get("ids"))
        .or_else(|| params.get("Ids"))
        .map(|v| v.join(","))
        .unwrap_or_default();

    let mut positions = positions_for(&state, &user, &native, &entry_ids).await;
    // Highest first: removing shifts everything after it down a slot.
    positions.sort_unstable_by(|a, b| b.cmp(a));
    for index in positions {
        if let Err(e) = repo::playlist::remove_track_at(&state.pool, &native, index).await {
            tracing::warn!(playlist_id = %native, index, "jellyfin: remove from playlist failed: {}", e);
        }
    }
    HttpResponse::NoContent().finish()
}

/// `POST /Playlists/{id}/Items/{itemId}/Move/{newIndex}`.
///
/// The playlist tables order entries by insertion time with no rank column, so
/// a move is a remove followed by re-adds: everything from the lower of the two
/// positions onward is re-appended in the new order. Correct, and cheap enough
/// at playlist sizes; there is nothing to reorder in place.
pub async fn move_playlist_item(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<(String, String, i64)>,
) -> HttpResponse {
    let (playlist, entry, new_index) = path.into_inner();
    let Some(native) = native_playlist(&state, &playlist).await else {
        return HttpResponse::NotFound().finish();
    };
    if !owned(&state, &user, &native).await {
        return HttpResponse::Forbidden().finish();
    }

    let Ok(Some((_, tracks))) = repo::playlist::get_playlist(&state.pool, &native, &user.id).await
    else {
        return HttpResponse::NotFound().finish();
    };

    let positions = positions_for(&state, &user, &native, &entry).await;
    let Some(from) = positions.first().copied() else {
        return HttpResponse::NotFound().finish();
    };

    let mut order: Vec<String> = tracks.iter().map(|t| t.xata_id.clone()).collect();
    if from < 0 || from as usize >= order.len() {
        return HttpResponse::BadRequest().finish();
    }
    let moved = order.remove(from as usize);
    let to = new_index.clamp(0, order.len() as i64) as usize;
    order.insert(to, moved);

    let first_changed = from.min(new_index).max(0) as usize;
    for index in (first_changed..tracks.len()).rev() {
        if let Err(e) = repo::playlist::remove_track_at(&state.pool, &native, index as i64).await {
            tracing::error!(playlist_id = %native, "jellyfin: move failed while removing: {}", e);
            return HttpResponse::InternalServerError().finish();
        }
    }
    for track_id in order.iter().skip(first_changed) {
        if let Err(e) = repo::playlist::add_track(&state.pool, &native, track_id).await {
            tracing::error!(playlist_id = %native, "jellyfin: move failed while re-adding: {}", e);
            return HttpResponse::InternalServerError().finish();
        }
    }
    HttpResponse::NoContent().finish()
}

/// `DELETE /Items/{id}` — Jellyfin deletes a playlist through the generic item
/// endpoint. Songs and albums are not deletable here: the library is owned by
/// the upload pipeline, not by this API.
pub async fn delete_item(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let id = path.into_inner();
    let Some((kind, native)) = guid::lookup(&state.pool, &id).await else {
        return HttpResponse::NotFound().finish();
    };
    if kind != guid::KIND_PLAYLIST {
        return HttpResponse::Forbidden().json(json!({
            "Message": "Only playlists can be deleted through this API"
        }));
    }
    if !owned(&state, &user, &native).await {
        return HttpResponse::Forbidden().finish();
    }
    match repo::playlist::delete_playlist(&state.pool, &native).await {
        Ok(_) => HttpResponse::NoContent().finish(),
        Err(e) => {
            tracing::error!("jellyfin: delete playlist failed: {}", e);
            HttpResponse::InternalServerError().finish()
        }
    }
}
