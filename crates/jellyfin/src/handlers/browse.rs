//! The item-by-name browse surfaces: `/Artists`, `/Genres`, `/Years`, the
//! prefix rails, and the counts/filters calls clients make to build a library
//! sidebar.

use actix_web::{web, HttpRequest, HttpResponse};
use serde_json::json;
use std::collections::BTreeSet;

use rocksky_navidrome::repo;

use crate::{
    auth::AuthedUser,
    convert::{self, Ctx},
    dto::{
        BaseItemDto, ItemCounts, ItemsResult, NameGuidPair, NameValuePair, QueryFilters,
        QueryFiltersLegacy,
    },
    guid, library, query,
    state::AppState,
};

// ── Artists ─────────────────────────────────────────────────────────────────

pub async fn artists(
    user: AuthedUser,
    state: web::Data<AppState>,
    req: HttpRequest,
) -> HttpResponse {
    let q = query::parse(&req);
    let ctx = Ctx::new(&state, &user);
    // Only tracks can be starred, so a favourites query on /Artists has nothing
    // to return.
    if q.favorites_only() {
        return HttpResponse::Ok().json(ItemsResult::empty());
    }
    super::items::all_artists(&ctx, &q).await
}

pub async fn artist_by_name(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let name = path.into_inner();
    let ctx = Ctx::new(&state, &user);

    // Clients hit this route with both a name and — depending on the client — a
    // guid, because `/Artists/{id}/…` and `/Artists/{name}` share a shape.
    if let Some(dto) = super::items::item_dto(&ctx, &name).await {
        if dto.item_type == "MusicArtist" {
            return HttpResponse::Ok().json(dto);
        }
    }

    match library::artist_by_name(&state.pool, &user.id, &name).await {
        Ok(Some(a)) => match convert::artists_to_items(&ctx, &[a]).await.pop() {
            Some(dto) => HttpResponse::Ok().json(dto),
            None => HttpResponse::NotFound().finish(),
        },
        Ok(None) => HttpResponse::NotFound().finish(),
        Err(e) => {
            tracing::error!("jellyfin: artist lookup failed: {}", e);
            HttpResponse::InternalServerError().finish()
        }
    }
}

// ── Prefix rails ────────────────────────────────────────────────────────────

pub async fn artists_prefixes(user: AuthedUser, state: web::Data<AppState>) -> HttpResponse {
    let names = library::all_artists(&state.pool, &user.id)
        .await
        .map(|rows| rows.iter().map(|a| a.name.clone()).collect::<Vec<_>>())
        .unwrap_or_default();
    prefix_response(&names)
}

pub async fn items_prefixes(
    user: AuthedUser,
    state: web::Data<AppState>,
    req: HttpRequest,
) -> HttpResponse {
    let q = query::parse(&req);
    let names: Vec<String> = if q.wants("MusicAlbum") {
        library::all_albums(&state.pool, &user.id)
            .await
            .map(|rows| rows.iter().map(|a| a.title.clone()).collect())
            .unwrap_or_default()
    } else if q.wants("Audio") {
        repo::track::search_tracks(&state.pool, &user.id, "", 1000, 0)
            .await
            .map(|rows| rows.into_iter().map(|t| t.title).collect())
            .unwrap_or_default()
    } else {
        library::all_artists(&state.pool, &user.id)
            .await
            .map(|rows| rows.iter().map(|a| a.name.clone()).collect())
            .unwrap_or_default()
    };
    prefix_response(&names)
}

fn prefix_response(names: &[String]) -> HttpResponse {
    let items: Vec<_> = library::prefixes_of(names.iter().map(String::as_str))
        .into_iter()
        .map(|p| json!({ "Name": p.clone(), "Id": p }))
        .collect();
    HttpResponse::Ok().json(items)
}

// ── Genres ──────────────────────────────────────────────────────────────────

pub async fn genres_list(
    user: AuthedUser,
    state: web::Data<AppState>,
    req: HttpRequest,
) -> HttpResponse {
    let q = query::parse(&req);
    let ctx = Ctx::new(&state, &user);
    let rows = repo::genre::get_genres(&state.pool, &user.id)
        .await
        .unwrap_or_default();

    let filtered: Vec<_> = rows
        .into_iter()
        .filter(|g| {
            library::name_matches(
                &g.genre,
                q.name_starts_with.as_deref(),
                q.name_starts_with_or_greater.as_deref(),
                q.name_less_than.as_deref(),
            )
        })
        .collect();

    let total = filtered.len() as i32;
    let offset = q.offset();
    let slice: Vec<_> = filtered
        .into_iter()
        .skip(offset as usize)
        .take(q.limit_or(500) as usize)
        .collect();
    let dtos = convert::genres_to_items(&ctx, &slice).await;
    HttpResponse::Ok().json(ItemsResult::new(dtos, total, offset))
}

pub async fn genre_by_name(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let name = path.into_inner();
    let ctx = Ctx::new(&state, &user);
    let rows = repo::genre::get_genres(&state.pool, &user.id)
        .await
        .unwrap_or_default();

    // The path segment is a name for most clients and a guid for the ones that
    // round-trip the id from `/Genres`.
    let by_guid = guid::normalize(&name);
    let found = rows
        .into_iter()
        .find(|g| g.genre.eq_ignore_ascii_case(&name) || guid::genre_guid(&g.genre) == by_guid);

    match found {
        Some(row) => match convert::genres_to_items(&ctx, &[row]).await.pop() {
            Some(dto) => HttpResponse::Ok().json(dto),
            None => HttpResponse::NotFound().finish(),
        },
        None => HttpResponse::NotFound().finish(),
    }
}

// ── Years / Persons / Studios ───────────────────────────────────────────────

pub async fn years_list(
    user: AuthedUser,
    state: web::Data<AppState>,
    req: HttpRequest,
) -> HttpResponse {
    let q = query::parse(&req);
    let mut years: Vec<i32> = distinct_years(&state, &user).await.into_iter().collect();
    if q.descending() {
        years.reverse();
    }

    let mut items: Vec<BaseItemDto> = Vec::with_capacity(years.len());
    for year in years {
        items.push(year_item(&state, &user, year).await);
    }
    HttpResponse::Ok().json(ItemsResult::whole(items))
}

pub async fn year_by_value(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let raw = path.into_inner();
    let years = distinct_years(&state, &user).await;
    // The segment is the year itself for most clients, and the guid for the
    // ones that round-trip the id from `/Years`.
    let found = raw
        .parse::<i32>()
        .ok()
        .filter(|y| years.contains(y))
        .or_else(|| {
            let g = guid::normalize(&raw);
            years.iter().copied().find(|y| guid::year_guid(*y) == g)
        });

    match found {
        Some(year) => HttpResponse::Ok().json(year_item(&state, &user, year).await),
        None => HttpResponse::NotFound().finish(),
    }
}

/// A year tile, with the counts clients render under it. Rocksky dates a
/// release on the album, so a year's songs are the songs on its albums.
async fn year_item(state: &AppState, user: &AuthedUser, year: i32) -> BaseItemDto {
    guid::remember(&state.pool, guid::KIND_YEAR, &year.to_string()).await;

    let albums = library::all_albums(&state.pool, &user.id)
        .await
        .unwrap_or_default();
    let of_year: Vec<_> = albums.iter().filter(|a| a.year == Some(year)).collect();
    let album_count = of_year.len() as i32;
    let song_count: i64 = of_year.iter().map(|a| a.song_count).sum();

    BaseItemDto {
        id: guid::year_guid(year),
        server_id: Some(state.server_id.clone()),
        name: Some(year.to_string()),
        sort_name: Some(year.to_string()),
        item_type: "Year",
        media_type: "Unknown",
        is_folder: Some(true),
        production_year: Some(year),
        album_count: Some(album_count),
        song_count: Some(song_count as i32),
        child_count: Some(album_count),
        location_type: Some("Virtual"),
        ..Default::default()
    }
}

async fn distinct_years(state: &AppState, user: &AuthedUser) -> BTreeSet<i32> {
    library::all_albums(&state.pool, &user.id)
        .await
        .map(|rows| {
            rows.iter()
                .filter_map(|a| a.year)
                .filter(|y| *y > 0)
                .collect()
        })
        .unwrap_or_default()
}

/// Rocksky's catalogue has no person or studio credits, so these are
/// permanently empty. They are routed rather than 404'd so clients stop
/// retrying them on every library page.
pub async fn empty_items(_user: AuthedUser) -> HttpResponse {
    HttpResponse::Ok().json(ItemsResult::empty())
}

pub async fn not_found_item(_user: AuthedUser, _path: web::Path<String>) -> HttpResponse {
    HttpResponse::NotFound().finish()
}

// ── Counts / filters ────────────────────────────────────────────────────────

pub async fn items_counts(user: AuthedUser, state: web::Data<AppState>) -> HttpResponse {
    let artists = library::all_artists(&state.pool, &user.id)
        .await
        .map(|r| r.len())
        .unwrap_or(0);
    let albums = library::all_albums(&state.pool, &user.id)
        .await
        .map(|r| r.len())
        .unwrap_or(0);
    let songs = library::count_songs(&state.pool, &user.id, "")
        .await
        .unwrap_or(0);

    HttpResponse::Ok().json(ItemCounts {
        artist_count: artists as i32,
        album_count: albums as i32,
        song_count: songs as i32,
        ..Default::default()
    })
}

pub async fn items_filters(user: AuthedUser, state: web::Data<AppState>) -> HttpResponse {
    let genres = repo::genre::get_genres(&state.pool, &user.id)
        .await
        .unwrap_or_default();
    HttpResponse::Ok().json(QueryFiltersLegacy {
        genres: genres.into_iter().map(|g| g.genre).collect(),
        tags: vec![],
        official_ratings: vec![],
        years: distinct_years(&state, &user).await.into_iter().collect(),
    })
}

pub async fn items_filters2(user: AuthedUser, state: web::Data<AppState>) -> HttpResponse {
    let rows = repo::genre::get_genres(&state.pool, &user.id)
        .await
        .unwrap_or_default();
    // Remembered so a `?parentId=<genre guid>` drill-down can be reversed back
    // to the exact-cased name.
    for row in &rows {
        guid::remember_genre(&state.pool, &row.genre).await;
    }
    HttpResponse::Ok().json(QueryFilters {
        genres: rows
            .into_iter()
            .map(|g| NameGuidPair {
                id: guid::genre_guid(&g.genre),
                name: Some(g.genre),
            })
            .collect(),
        tags: vec![],
        audio_languages: Vec::<NameValuePair>::new(),
        subtitle_languages: Vec::<NameValuePair>::new(),
    })
}

// ── Search hints ────────────────────────────────────────────────────────────

/// `/Search/Hints` — the quick-search dropdown. Same backends as `/Items?searchTerm=`,
/// but a flatter payload the clients render inline.
pub async fn search_hints(
    user: AuthedUser,
    state: web::Data<AppState>,
    req: HttpRequest,
) -> HttpResponse {
    let q = query::parse(&req);
    let ctx = Ctx::new(&state, &user);
    let Some(term) = q.search_term.as_deref().filter(|s| !s.is_empty()) else {
        return HttpResponse::Ok().json(json!({ "SearchHints": [], "TotalRecordCount": 0 }));
    };

    let limit = q.limit_or(20);
    let (artists, albums, songs) = super::items::search_all(&ctx, &q, term, limit).await;

    let mut hints: Vec<serde_json::Value> = Vec::new();
    for dto in convert::artists_to_items(&ctx, &artists).await {
        hints.push(json!({
            "ItemId": dto.id, "Id": dto.id,
            "Name": dto.name,
            "Type": "MusicArtist", "MediaType": "Unknown", "IsFolder": true,
        }));
    }
    for dto in convert::albums_to_items(&ctx, &albums).await {
        hints.push(json!({
            "ItemId": dto.id, "Id": dto.id,
            "Name": dto.name,
            "Album": dto.album,
            "AlbumArtist": dto.album_artist,
            "Type": "MusicAlbum", "MediaType": "Unknown", "IsFolder": true,
            "RunTimeTicks": dto.run_time_ticks,
        }));
    }
    for dto in convert::songs_to_items(&ctx, &songs).await {
        hints.push(json!({
            "ItemId": dto.id, "Id": dto.id,
            "Name": dto.name,
            "Album": dto.album,
            "AlbumId": dto.album_id,
            "AlbumArtist": dto.album_artist,
            "Type": "Audio", "MediaType": "Audio", "IsFolder": false,
            "RunTimeTicks": dto.run_time_ticks,
        }));
    }

    let total = hints.len() as i32;
    HttpResponse::Ok().json(json!({ "SearchHints": hints, "TotalRecordCount": total }))
}

// ── Instant mix ─────────────────────────────────────────────────────────────

/// Build a mix around a seed item.
///
/// There is no similarity model behind this, so it falls back in tiers: the
/// tracks the seed itself names, then more from the same genre, then random
/// library filler. Deduped by track id and capped at the requested limit.
pub async fn instant_mix(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    let q = query::parse(&req);
    let ctx = Ctx::new(&state, &user);
    let limit = q.limit_or(50);
    let seed = path.into_inner();

    let Some((kind, native)) = resolve_seed(&state, &user, &seed).await else {
        return HttpResponse::NotFound().finish();
    };

    let pool = &state.pool;
    let uid = &user.id;
    let mut picked: Vec<rocksky_navidrome::xata::track::TrackWithUpload> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut genre: Option<String> = None;

    let seeds = match kind.as_str() {
        "song" => repo::track::get_track_by_id(pool, &native, uid)
            .await
            .ok()
            .flatten()
            .map(|t| vec![t])
            .unwrap_or_default(),
        "album" => repo::track::get_tracks_by_album(pool, &native, uid)
            .await
            .unwrap_or_default(),
        "artist" => library::songs_by_artist(pool, uid, &native, limit, 0)
            .await
            .unwrap_or_default(),
        "playlist" => repo::playlist::get_playlist(pool, &native, uid)
            .await
            .ok()
            .flatten()
            .map(|(_, tracks)| tracks)
            .unwrap_or_default(),
        "genre" => {
            genre = Some(native.clone());
            repo::genre::get_songs_by_genre(pool, uid, &native, limit, 0)
                .await
                .unwrap_or_default()
        }
        _ => vec![],
    };
    genre = genre.or_else(|| seeds.iter().find_map(|t| t.genre.clone()));
    for t in seeds {
        if seen.insert(t.xata_id.clone()) {
            picked.push(t);
        }
    }

    if picked.len() < limit as usize {
        if let Some(g) = &genre {
            let more = repo::genre::get_songs_by_genre(pool, uid, g, limit, 0)
                .await
                .unwrap_or_default();
            for t in more {
                if picked.len() >= limit as usize {
                    break;
                }
                if seen.insert(t.xata_id.clone()) {
                    picked.push(t);
                }
            }
        }
    }

    if picked.len() < limit as usize {
        let filler = repo::track::get_random_songs(pool, uid, limit, None, None, None)
            .await
            .unwrap_or_default();
        for t in filler {
            if picked.len() >= limit as usize {
                break;
            }
            if seen.insert(t.xata_id.clone()) {
                picked.push(t);
            }
        }
    }

    picked.truncate(limit as usize);
    let dtos = convert::songs_to_items(&ctx, &picked).await;
    HttpResponse::Ok().json(ItemsResult::whole(dtos))
}

/// What a mix can be seeded from.
///
/// A guid is the usual case, but `/MusicGenres/{name}/InstantMix` and
/// `/Artists/{name}/InstantMix` put a display name in the path, so fall back to
/// matching one — otherwise a genre mix only works after the client has
/// happened to list `/Genres` first.
async fn resolve_seed(state: &AppState, user: &AuthedUser, seed: &str) -> Option<(String, String)> {
    if let Some(pair) = super::items::resolve(state, seed).await {
        return Some(pair);
    }
    if let Ok(rows) = repo::genre::get_genres(&state.pool, &user.id).await {
        if let Some(row) = rows
            .into_iter()
            .find(|g| g.genre.eq_ignore_ascii_case(seed))
        {
            return Some((guid::KIND_GENRE.to_string(), row.genre));
        }
    }
    if let Ok(Some(artist)) = library::artist_by_name(&state.pool, &user.id, seed).await {
        return Some((guid::KIND_ARTIST.to_string(), artist.xata_id));
    }
    None
}

/// `/MusicGenres/InstantMix?id=…` — the same call with the seed in the query
/// string instead of the path.
///
/// An unresolvable id yields an empty mix rather than a 404: this is the form
/// clients use to seed from a genre they only have a name for, and a 404 there
/// reads as a broken server rather than an empty shelf.
pub async fn instant_mix_by_query(
    user: AuthedUser,
    state: web::Data<AppState>,
    req: HttpRequest,
) -> HttpResponse {
    let params = query::collect(&req);
    let id = params
        .get("id")
        .or_else(|| params.get("Id"))
        .and_then(|v| v.first())
        .cloned()
        .unwrap_or_default();

    if resolve_seed(&state, &user, &id).await.is_none() {
        return HttpResponse::Ok().json(ItemsResult::empty());
    }
    instant_mix(user, state, web::Path::from(id), req).await
}

/// `/…/Similar` — Rocksky has no similarity model wired into this service, so
/// an empty result is the accurate answer. Routed so the calls don't show up as
/// unmatched 404s on every detail page.
pub async fn similar(_user: AuthedUser, _path: web::Path<String>) -> HttpResponse {
    HttpResponse::Ok().json(ItemsResult::empty())
}
