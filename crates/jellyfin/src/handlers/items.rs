//! `/Items` and everything that hangs off it.
//!
//! Jellyfin has one very general listing endpoint and a handful of aliases, and
//! clients disagree wildly about which shape they use to ask for the same
//! thing. The dispatcher below mirrors the reference server's precedence:
//! favourites filter, then the bare "what libraries are there" call, then
//! search, then explicit ids, then a parent, and only then a type filter.

use actix_web::{web, HttpRequest, HttpResponse};
use rand::seq::SliceRandom;
use std::collections::HashSet;

use rocksky_navidrome::{
    repo,
    xata::{album::AlbumWithStats, artist::ArtistWithStats, track::TrackWithUpload},
};

use crate::{
    auth::AuthedUser,
    convert::{self, Ctx},
    dto::{BaseItemDto, ItemsResult},
    guid, library,
    query::{self, ItemsQuery},
    state::AppState,
};

/// Take one page out of an in-memory list.
fn page<T: Clone>(rows: &[T], offset: i64, limit: i64) -> Vec<T> {
    rows.iter()
        .skip(offset.max(0) as usize)
        .take(limit.max(0) as usize)
        .cloned()
        .collect()
}

pub async fn resolve(state: &AppState, id: &str) -> Option<(String, String)> {
    guid::lookup(&state.pool, id).await
}

pub async fn items(user: AuthedUser, state: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    dispatch(&state, &user, query::parse(&req)).await
}

pub async fn user_items(
    user: AuthedUser,
    state: web::Data<AppState>,
    _path: web::Path<String>,
    req: HttpRequest,
) -> HttpResponse {
    dispatch(&state, &user, query::parse(&req)).await
}

async fn dispatch(state: &AppState, user: &AuthedUser, q: ItemsQuery) -> HttpResponse {
    let ctx = Ctx::new(state, user);

    // Runs before everything, including the library-views fallback: the
    // reference client's Favorites rail sends `?filters=IsFavorite&recursive=true`
    // with no parent at all, and without this we would answer it with
    // CollectionFolder tiles.
    if q.favorites_only() {
        return favorites(&ctx, &q).await;
    }

    if q.is_bare() {
        return HttpResponse::Ok().json(ItemsResult::whole(convert::all_libraries(state)));
    }

    if let Some(term) = q.search_term.as_deref().filter(|s| !s.is_empty()) {
        return search(&ctx, &q, term).await;
    }

    if let Some(ids) = q.ids.clone() {
        return by_ids(&ctx, &ids).await;
    }

    if let Some(parent) = q.parent_id.clone() {
        return by_parent(&ctx, &q, &parent).await;
    }

    if q.wants("Playlist") {
        return playlists(&ctx, &q).await;
    }

    if q.wants("Audio") {
        if let Some(native) = resolve_as(state, q.first_artist_filter(), "artist").await {
            return songs_of_artist(&ctx, &q, &native).await;
        }
        if let Some(native) = resolve_as(state, q.first_genre_filter(), "genre").await {
            return songs_of_genre(&ctx, &q, &native).await;
        }
        let album_filter = q
            .album_ids
            .as_deref()
            .and_then(|s| query::split_ids(s).first().copied());
        if let Some(native) = resolve_as(state, album_filter, "album").await {
            return songs_of_album(&ctx, &native).await;
        }
        return all_songs(&ctx, &q).await;
    }

    if q.wants("MusicAlbum") {
        if let Some(native) = resolve_as(state, q.first_artist_filter(), "artist").await {
            return albums_of_artist(&ctx, &native).await;
        }
        return all_albums(&ctx, &q).await;
    }

    artists_or_albums(&ctx, &q).await
}

/// Resolve an id, but only accept it when it names the kind we're about to
/// treat it as — a client that sends an album id in `artistIds` should get
/// nothing, not somebody's whole library.
async fn resolve_as(state: &AppState, id: Option<&str>, want: &str) -> Option<String> {
    let (kind, native) = resolve(state, id?).await?;
    (kind == want).then_some(native)
}

// ── By parent ───────────────────────────────────────────────────────────────

async fn by_parent(ctx: &Ctx<'_>, q: &ItemsQuery, parent: &str) -> HttpResponse {
    let g = guid::normalize(parent);

    if g == guid::library_guid() {
        return artists_or_albums(ctx, q).await;
    }
    if g == guid::playlists_library_guid() {
        return playlists(ctx, q).await;
    }

    let Some((kind, native)) = resolve(ctx.state, &g).await else {
        return HttpResponse::Ok().json(ItemsResult::empty());
    };

    match kind.as_str() {
        "artist" => {
            if q.wants("Audio") {
                songs_of_artist(ctx, q, &native).await
            } else {
                albums_of_artist(ctx, &native).await
            }
        }
        "album" => songs_of_album(ctx, &native).await,
        "genre" => {
            if q.wants("MusicAlbum") {
                albums_of_genre(ctx, q, &native).await
            } else {
                songs_of_genre(ctx, q, &native).await
            }
        }
        "year" => match native.parse::<i32>() {
            Ok(year) => year_children(ctx, q, year).await,
            Err(_) => HttpResponse::NotFound().finish(),
        },
        "playlist" => playlist_songs(ctx, &native).await,
        // A parent that resolves to something with no children of the type the
        // client asked for. Empty is the honest answer — falling through would
        // dump the whole artist list into an album page.
        _ => HttpResponse::Ok().json(ItemsResult::empty()),
    }
}

// ── Listings ────────────────────────────────────────────────────────────────

async fn artists_or_albums(ctx: &Ctx<'_>, q: &ItemsQuery) -> HttpResponse {
    if q.wants("Audio") {
        return all_songs(ctx, q).await;
    }
    if q.wants("MusicAlbum") {
        return all_albums(ctx, q).await;
    }
    all_artists(ctx, q).await
}

pub async fn all_artists(ctx: &Ctx<'_>, q: &ItemsQuery) -> HttpResponse {
    let rows = match library::all_artists(&ctx.state.pool, &ctx.user.id).await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("jellyfin: artist listing failed: {}", e);
            return HttpResponse::InternalServerError().finish();
        }
    };

    let mut filtered: Vec<ArtistWithStats> = rows
        .iter()
        .filter(|a| {
            library::name_matches(
                &a.name,
                q.name_starts_with.as_deref(),
                q.name_starts_with_or_greater.as_deref(),
                q.name_less_than.as_deref(),
            )
        })
        .cloned()
        .collect();

    sort_artists(&mut filtered, q);

    let total = filtered.len() as i32;
    let offset = q.offset();
    let items = page(&filtered, offset, q.limit_or(500));
    let dtos = convert::artists_to_items(ctx, &items).await;
    HttpResponse::Ok().json(ItemsResult::new(dtos, total, offset))
}

fn sort_artists(rows: &mut [ArtistWithStats], q: &ItemsQuery) {
    match q.sort_key().as_deref() {
        Some("random") => rows.shuffle(&mut rand::thread_rng()),
        _ => {
            rows.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
            if q.descending() {
                rows.reverse();
            }
        }
    }
}

pub async fn all_albums(ctx: &Ctx<'_>, q: &ItemsQuery) -> HttpResponse {
    let rows = match library::all_albums(&ctx.state.pool, &ctx.user.id).await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("jellyfin: album listing failed: {}", e);
            return HttpResponse::InternalServerError().finish();
        }
    };

    let years: HashSet<i32> = q
        .years
        .as_deref()
        .map(|s| s.split(',').filter_map(|y| y.trim().parse().ok()).collect())
        .unwrap_or_default();

    let mut filtered: Vec<AlbumWithStats> = rows
        .iter()
        .filter(|a| {
            library::name_matches(
                &a.title,
                q.name_starts_with.as_deref(),
                q.name_starts_with_or_greater.as_deref(),
                q.name_less_than.as_deref(),
            )
        })
        .filter(|a| years.is_empty() || a.year.map(|y| years.contains(&y)).unwrap_or(false))
        .cloned()
        .collect();

    sort_albums(&mut filtered, q);

    let total = filtered.len() as i32;
    let offset = q.offset();
    let items = page(&filtered, offset, q.limit_or(100));
    let dtos = convert::albums_to_items(ctx, &items).await;
    HttpResponse::Ok().json(ItemsResult::new(dtos, total, offset))
}

fn sort_albums(rows: &mut [AlbumWithStats], q: &ItemsQuery) {
    match q.sort_key().as_deref() {
        Some("random") => {
            rows.shuffle(&mut rand::thread_rng());
            return;
        }
        Some("datecreated") | Some("datelastcontentadded") | Some("dateplayed") => {
            // "Recently added" means newest first, so this key alone defaults to
            // descending; an explicit Ascending still flips it below.
            rows.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            if !q.descending() && q.sort_order.is_some() {
                rows.reverse();
            }
            return;
        }
        Some("productionyear") | Some("premieredate") => {
            rows.sort_by(|a, b| a.year.cmp(&b.year));
        }
        Some("albumartist") | Some("artist") => {
            rows.sort_by(|a, b| a.artist.to_lowercase().cmp(&b.artist.to_lowercase()));
        }
        _ => rows.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase())),
    }
    if q.descending() {
        rows.reverse();
    }
}

pub async fn all_songs(ctx: &Ctx<'_>, q: &ItemsQuery) -> HttpResponse {
    let limit = q.limit_or(100);
    let offset = q.offset();

    // Random is its own query — paging a shuffled list makes no sense, and the
    // repo can do the shuffle in SQL.
    if q.sort_key().as_deref() == Some("random") {
        let rows =
            repo::track::get_random_songs(&ctx.state.pool, &ctx.user.id, limit, None, None, None)
                .await
                .unwrap_or_default();
        let dtos = convert::songs_to_items(ctx, &rows).await;
        return HttpResponse::Ok().json(ItemsResult::whole(dtos));
    }

    let starts = q.name_starts_with.as_deref();
    let geq = q.name_starts_with_or_greater.as_deref();
    let lt = q.name_less_than.as_deref();
    let filtered = [starts, geq, lt]
        .iter()
        .any(|f| matches!(f, Some(s) if !s.is_empty()));

    let (rows, total) = if filtered {
        (
            library::songs_filtered(
                &ctx.state.pool,
                &ctx.user.id,
                starts,
                geq,
                lt,
                limit,
                offset,
            )
            .await,
            library::count_songs_filtered(&ctx.state.pool, &ctx.user.id, starts, geq, lt).await,
        )
    } else {
        // The unfiltered browse-all path is the hot one — `search_tracks` pages
        // it in SQL off a narrow CTE instead of evaluating the per-row lateral
        // lookups for every row the OFFSET is about to discard.
        (
            repo::track::search_tracks(&ctx.state.pool, &ctx.user.id, "", limit, offset).await,
            library::count_songs(&ctx.state.pool, &ctx.user.id, "").await,
        )
    };

    let rows = match rows {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("jellyfin: song listing failed: {}", e);
            return HttpResponse::InternalServerError().finish();
        }
    };
    let total = total.unwrap_or(offset + rows.len() as i64) as i32;

    let dtos = convert::songs_to_items(ctx, &rows).await;
    HttpResponse::Ok().json(ItemsResult::new(dtos, total, offset))
}

async fn albums_of_artist(ctx: &Ctx<'_>, artist_id: &str) -> HttpResponse {
    let rows = repo::album::get_albums_by_artist(&ctx.state.pool, artist_id, &ctx.user.id)
        .await
        .unwrap_or_default();
    let dtos = convert::albums_to_items(ctx, &rows).await;
    HttpResponse::Ok().json(ItemsResult::whole(dtos))
}

async fn songs_of_artist(ctx: &Ctx<'_>, q: &ItemsQuery, artist_id: &str) -> HttpResponse {
    let offset = q.offset();
    let rows = library::songs_by_artist(
        &ctx.state.pool,
        &ctx.user.id,
        artist_id,
        q.limit_or(500),
        offset,
    )
    .await
    .unwrap_or_default();
    let dtos = convert::songs_to_items(ctx, &rows).await;
    let total = (offset + dtos.len() as i64) as i32;
    HttpResponse::Ok().json(ItemsResult::new(dtos, total, offset))
}

async fn songs_of_album(ctx: &Ctx<'_>, album_id: &str) -> HttpResponse {
    let rows = repo::track::get_tracks_by_album(&ctx.state.pool, album_id, &ctx.user.id)
        .await
        .unwrap_or_default();
    let dtos = convert::songs_to_items(ctx, &rows).await;
    HttpResponse::Ok().json(ItemsResult::whole(dtos))
}

async fn songs_of_genre(ctx: &Ctx<'_>, q: &ItemsQuery, genre: &str) -> HttpResponse {
    let offset = q.offset();
    let rows = repo::genre::get_songs_by_genre(
        &ctx.state.pool,
        &ctx.user.id,
        genre,
        q.limit_or(500),
        offset,
    )
    .await
    .unwrap_or_default();
    let dtos = convert::songs_to_items(ctx, &rows).await;
    let total = (offset + dtos.len() as i64) as i32;
    HttpResponse::Ok().json(ItemsResult::new(dtos, total, offset))
}

/// Albums in a genre, derived from the genre's tracks — the catalogue tags
/// genres on artists, not albums, so there is no album-level genre to query.
async fn albums_of_genre(ctx: &Ctx<'_>, q: &ItemsQuery, genre: &str) -> HttpResponse {
    let rows =
        repo::genre::get_songs_by_genre(&ctx.state.pool, &ctx.user.id, genre, q.limit_or(500), 0)
            .await
            .unwrap_or_default();

    let mut seen = HashSet::new();
    let mut albums: Vec<AlbumWithStats> = Vec::new();
    for track in &rows {
        let Some(album_id) = track.album_id.as_deref() else {
            continue;
        };
        if !seen.insert(album_id.to_string()) {
            continue;
        }
        if let Ok(Some(a)) =
            repo::album::get_album_by_id(&ctx.state.pool, album_id, &ctx.user.id).await
        {
            albums.push(a);
        }
    }
    let dtos = convert::albums_to_items(ctx, &albums).await;
    HttpResponse::Ok().json(ItemsResult::whole(dtos))
}

/// What a `/Years/{year}` tile drills down into. Rocksky dates a release on the
/// album, not the track, so a year's songs are the songs on its albums.
async fn year_children(ctx: &Ctx<'_>, q: &ItemsQuery, year: i32) -> HttpResponse {
    let albums = match library::all_albums(&ctx.state.pool, &ctx.user.id).await {
        Ok(rows) => rows
            .iter()
            .filter(|a| a.year == Some(year))
            .cloned()
            .collect::<Vec<_>>(),
        Err(e) => {
            tracing::error!("jellyfin: year listing failed: {}", e);
            return HttpResponse::InternalServerError().finish();
        }
    };

    if q.wants("MusicAlbum") {
        let dtos = convert::albums_to_items(ctx, &albums).await;
        return HttpResponse::Ok().json(ItemsResult::whole(dtos));
    }

    let mut tracks: Vec<TrackWithUpload> = Vec::new();
    for album in &albums {
        tracks.extend(
            repo::track::get_tracks_by_album(&ctx.state.pool, &album.xata_id, &ctx.user.id)
                .await
                .unwrap_or_default(),
        );
    }
    let dtos = convert::songs_to_items(ctx, &tracks).await;
    HttpResponse::Ok().json(ItemsResult::whole(dtos))
}

async fn playlists(ctx: &Ctx<'_>, q: &ItemsQuery) -> HttpResponse {
    let rows = repo::playlist::get_playlists(&ctx.state.pool, &ctx.user.id)
        .await
        .unwrap_or_default();
    let filtered: Vec<_> = rows
        .into_iter()
        .filter(|p| {
            library::name_matches(
                &p.name,
                q.name_starts_with.as_deref(),
                q.name_starts_with_or_greater.as_deref(),
                q.name_less_than.as_deref(),
            )
        })
        .collect();
    let total = filtered.len() as i32;
    let offset = q.offset();
    let items: Vec<_> = filtered
        .into_iter()
        .skip(offset as usize)
        .take(q.limit_or(500) as usize)
        .collect();
    let dtos = convert::playlists_to_items(ctx, &items).await;
    HttpResponse::Ok().json(ItemsResult::new(dtos, total, offset))
}

pub async fn playlist_songs(ctx: &Ctx<'_>, playlist_id: &str) -> HttpResponse {
    match repo::playlist::get_playlist(&ctx.state.pool, playlist_id, &ctx.user.id).await {
        Ok(Some((_, tracks))) => {
            let mut dtos = convert::songs_to_items(ctx, &tracks).await;
            // Entries are addressed by position, not by song id — the same song
            // can sit in a playlist twice, and remove/move have to tell the two
            // apart.
            for (index, dto) in dtos.iter_mut().enumerate() {
                dto.playlist_item_id = Some(crate::handlers::playlists::entry_guid(
                    playlist_id,
                    index as i64,
                ));
            }
            HttpResponse::Ok().json(ItemsResult::whole(dtos))
        }
        Ok(None) => HttpResponse::NotFound().finish(),
        Err(e) => {
            tracing::error!("jellyfin: playlist tracks failed: {}", e);
            HttpResponse::InternalServerError().finish()
        }
    }
}

// ── Favorites ───────────────────────────────────────────────────────────────

/// Only tracks can be starred — `loved_tracks` is the store, and it is what the
/// ATProto like record mirrors. An artist- or album-only favourites query
/// therefore has nothing to return rather than something approximate.
async fn favorites(ctx: &Ctx<'_>, q: &ItemsQuery) -> HttpResponse {
    if q.include_item_types.is_some() && !q.wants("Audio") {
        return HttpResponse::Ok().json(ItemsResult::empty());
    }

    let starred = repo::starred::get_starred_tracks(&ctx.state.pool, &ctx.user.id)
        .await
        .unwrap_or_default();

    let ids: Vec<String> = starred.iter().map(|t| t.xata_id.clone()).collect();
    let total = ids.len() as i32;
    let offset = q.offset();
    let wanted = page(&ids, offset, q.limit_or(500));

    let rows = repo::track::get_tracks_by_ids(&ctx.state.pool, &wanted, &ctx.user.id)
        .await
        .unwrap_or_default();
    let dtos = convert::songs_to_items(ctx, &rows).await;
    HttpResponse::Ok().json(ItemsResult::new(dtos, total, offset))
}

// ── Search ──────────────────────────────────────────────────────────────────

async fn search(ctx: &Ctx<'_>, q: &ItemsQuery, term: &str) -> HttpResponse {
    let limit = q.limit_or(50);
    let (artists, albums, songs) = search_all(ctx, q, term, limit).await;

    let mut items: Vec<BaseItemDto> = Vec::new();
    items.extend(convert::artists_to_items(ctx, &artists).await);
    items.extend(convert::albums_to_items(ctx, &albums).await);
    items.extend(convert::songs_to_items(ctx, &songs).await);

    HttpResponse::Ok().json(ItemsResult::whole(items))
}

/// Run a text search across the three entity kinds the client asked for.
///
/// Typesense answers when it is configured and the term is non-empty; the
/// Postgres LIKE path is the fallback, exactly as in the Subsonic service.
pub async fn search_all(
    ctx: &Ctx<'_>,
    q: &ItemsQuery,
    term: &str,
    limit: i64,
) -> (
    Vec<ArtistWithStats>,
    Vec<AlbumWithStats>,
    Vec<TrackWithUpload>,
) {
    let unfiltered = q.include_item_types.is_none();
    let want_artists = unfiltered || q.wants("MusicArtist");
    let want_albums = unfiltered || q.wants("MusicAlbum");
    let want_songs = unfiltered || q.wants("Audio");

    let pool = &ctx.state.pool;
    let user = &ctx.user.id;

    if let Some(ts) = ctx.state.typesense() {
        let (ids, pairs, names) = tokio::join!(
            ts.search_track_ids(user, term, limit, 0),
            ts.search_album_names(user, term, limit, 0),
            ts.search_artist_names(user, term, limit, 0),
        );
        let (songs, albums, artists) = tokio::join!(
            async {
                if want_songs {
                    repo::track::get_tracks_by_ids(pool, &ids.unwrap_or_default(), user)
                        .await
                        .unwrap_or_default()
                } else {
                    vec![]
                }
            },
            async {
                if want_albums {
                    repo::album::get_albums_by_names(pool, user, &pairs.unwrap_or_default())
                        .await
                        .unwrap_or_default()
                } else {
                    vec![]
                }
            },
            async {
                if want_artists {
                    repo::artist::get_artists_by_names(pool, user, &names.unwrap_or_default())
                        .await
                        .unwrap_or_default()
                } else {
                    vec![]
                }
            },
        );
        return (artists, albums, songs);
    }

    let (artists, albums, songs) = tokio::join!(
        async {
            if want_artists {
                repo::artist::search_artists(pool, user, term, limit, 0)
                    .await
                    .unwrap_or_default()
            } else {
                vec![]
            }
        },
        async {
            if want_albums {
                repo::album::search_albums(pool, user, term, limit, 0)
                    .await
                    .unwrap_or_default()
            } else {
                vec![]
            }
        },
        async {
            if want_songs {
                repo::track::search_tracks(pool, user, term, limit, 0)
                    .await
                    .unwrap_or_default()
            } else {
                vec![]
            }
        },
    );
    (artists, albums, songs)
}

// ── Explicit ids ────────────────────────────────────────────────────────────

async fn by_ids(ctx: &Ctx<'_>, ids: &str) -> HttpResponse {
    let mut items: Vec<BaseItemDto> = Vec::new();
    for raw in query::split_ids(ids) {
        if let Some(dto) = item_dto(ctx, raw).await {
            items.push(dto);
        }
    }
    HttpResponse::Ok().json(ItemsResult::whole(items))
}

/// One item by id, whatever kind it turns out to be.
pub async fn item_dto(ctx: &Ctx<'_>, id: &str) -> Option<BaseItemDto> {
    let g = guid::normalize(id);
    if let Some(view) = convert::library_by_guid(ctx.state, &g) {
        return Some(view);
    }

    let (kind, native) = resolve(ctx.state, &g).await?;
    let pool = &ctx.state.pool;
    let user = &ctx.user.id;

    match kind.as_str() {
        "song" => {
            let track = repo::track::get_track_by_id(pool, &native, user)
                .await
                .ok()??;
            Some(convert::song_to_item(ctx, &track).await)
        }
        "album" => {
            let album = repo::album::get_album_by_id(pool, &native, user)
                .await
                .ok()??;
            convert::albums_to_items(ctx, &[album]).await.pop()
        }
        "artist" => {
            let artist = library::artist_by_id(pool, user, &native).await.ok()??;
            convert::artists_to_items(ctx, &[artist]).await.pop()
        }
        "playlist" => {
            let (playlist, _) = repo::playlist::get_playlist(pool, &native, user)
                .await
                .ok()??;
            convert::playlists_to_items(ctx, &[playlist]).await.pop()
        }
        "genre" => {
            let genres = repo::genre::get_genres(pool, user).await.ok()?;
            let row = genres.into_iter().find(|g| g.genre == native)?;
            convert::genres_to_items(ctx, &[row]).await.pop()
        }
        _ => None,
    }
}

pub async fn item_by_id(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> HttpResponse {
    let ctx = Ctx::new(&state, &user);
    match item_dto(&ctx, &path.into_inner()).await {
        Some(dto) => HttpResponse::Ok().json(dto),
        None => HttpResponse::NotFound().finish(),
    }
}

pub async fn user_item_by_id(
    user: AuthedUser,
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
) -> HttpResponse {
    let (_uid, item_id) = path.into_inner();
    let ctx = Ctx::new(&state, &user);
    match item_dto(&ctx, &item_id).await {
        Some(dto) => HttpResponse::Ok().json(dto),
        None => HttpResponse::NotFound().finish(),
    }
}

// ── Home rails ──────────────────────────────────────────────────────────────

/// `/Items/Latest` — recently added. Albums by default; `IncludeItemTypes=Audio`
/// asks for tracks instead.
pub async fn items_latest(
    user: AuthedUser,
    state: web::Data<AppState>,
    req: HttpRequest,
) -> HttpResponse {
    let q = query::parse(&req);
    let ctx = Ctx::new(&state, &user);
    let limit = q.limit_or(20);

    if q.wants("Audio") {
        let rows = repo::track::search_tracks(&state.pool, &user.id, "", limit, 0)
            .await
            .unwrap_or_default();
        let dtos = convert::songs_to_items(&ctx, &rows).await;
        // The rail is a bare array, not an ItemsResult — clients that get the
        // wrapper here render an empty row.
        return HttpResponse::Ok().json(dtos);
    }

    let rows = repo::album::get_album_list(
        &state.pool,
        &user.id,
        "newest",
        limit,
        q.offset(),
        None,
        None,
        None,
    )
    .await
    .unwrap_or_default();
    let dtos = convert::albums_to_items(&ctx, &rows).await;
    HttpResponse::Ok().json(dtos)
}

pub async fn view_latest(
    user: AuthedUser,
    state: web::Data<AppState>,
    _path: web::Path<(String, String)>,
    req: HttpRequest,
) -> HttpResponse {
    items_latest(user, state, req).await
}

/// `/Items/Suggestions` — a random handful from the library. Albums unless the
/// client asked for tracks, matching what the reference server's home rail
/// shows.
pub async fn items_suggestions(
    user: AuthedUser,
    state: web::Data<AppState>,
    req: HttpRequest,
) -> HttpResponse {
    let q = query::parse(&req);
    let ctx = Ctx::new(&state, &user);
    let limit = q.limit_or(20);

    if q.wants("Audio") {
        let rows = repo::track::get_random_songs(&state.pool, &user.id, limit, None, None, None)
            .await
            .unwrap_or_default();
        let dtos = convert::songs_to_items(&ctx, &rows).await;
        return HttpResponse::Ok().json(ItemsResult::whole(dtos));
    }

    let rows =
        repo::album::get_album_list(&state.pool, &user.id, "random", limit, 0, None, None, None)
            .await
            .unwrap_or_default();
    let dtos = convert::albums_to_items(&ctx, &rows).await;
    HttpResponse::Ok().json(ItemsResult::whole(dtos))
}

/// `/Items/Resume` — tracks the user stopped part-way through and hasn't
/// finished. Positions come from the playback reports and from clients writing
/// `PlaybackPositionTicks` directly.
pub async fn items_resume(
    user: AuthedUser,
    state: web::Data<AppState>,
    req: HttpRequest,
) -> HttpResponse {
    let q = query::parse(&req);
    let ctx = Ctx::new(&state, &user);
    let ids = crate::userdata::resume_items(&state.pool, &user.id, q.limit_or(20)).await;
    let rows = repo::track::get_tracks_by_ids(&state.pool, &ids, &user.id)
        .await
        .unwrap_or_default();
    let dtos = convert::songs_to_items(&ctx, &rows).await;
    HttpResponse::Ok().json(ItemsResult::whole(dtos))
}
