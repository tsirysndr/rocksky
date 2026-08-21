use crate::catalog;
use crate::db::{Catalog, PooledConn};
use crate::error::{ApiError, ApiResult};
use crate::models::*;
use crate::search;
use actix_web::{web, HttpResponse, Responder};
use serde::Deserialize;

/// Spotify's per-endpoint caps on `ids=`. Enforced so a caller that works
/// against riff keeps working against the real API.
const MAX_IDS_ARTISTS: usize = 50;
const MAX_IDS_ALBUMS: usize = 20;
const MAX_IDS_TRACKS: usize = 50;
const MAX_IDS_AUDIO_FEATURES: usize = 100;

const MAX_PAGE: u32 = 50;
const DEFAULT_PAGE: u32 = 20;

/// Runs a DuckDB query on the blocking pool.
///
/// DuckDB calls are synchronous and can scan for a long time; running one
/// directly in a handler would park an actix worker thread and stall every
/// other in-flight request on that worker. The connection is checked out
/// *inside* the closure so it is acquired, used and returned on one thread —
/// `duckdb::Connection` is `Send` but not `Sync`. Separate handles do run
/// concurrently, which is what makes the pool worth having.
async fn blocking<T, F>(catalog: web::Data<Catalog>, f: F) -> ApiResult<T>
where
    F: FnOnce(&PooledConn) -> ApiResult<T> + Send + 'static,
    T: Send + 'static,
{
    web::block(move || {
        let conn = catalog.get()?;
        f(&conn)
    })
    .await?
}

fn page_size(limit: Option<u32>) -> u32 {
    limit.unwrap_or(DEFAULT_PAGE).clamp(1, MAX_PAGE)
}

fn parse_ids(raw: &str, max: usize) -> ApiResult<Vec<String>> {
    let ids: Vec<String> = raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    if ids.is_empty() {
        return Err(ApiError::BadRequest("No ids provided".into()));
    }
    if ids.len() > max {
        return Err(ApiError::BadRequest(format!(
            "Too many ids requested: max {max}"
        )));
    }
    Ok(ids)
}

// ------------------------------------------------------------------- index

const BANNER: &str = r"
██████╗ ██╗███████╗███████╗
██╔══██╗██║██╔════╝██╔════╝
██████╔╝██║█████╗  █████╗
██╔══██╗██║██╔══╝  ██╔══╝
██║  ██║██║██║     ██║
╚═╝  ╚═╝╚═╝╚═╝     ╚═╝
";

pub async fn index() -> impl Responder {
    let body = format!(
        r#"{BANNER}
riff v{version} — a read-only Spotify Web API served straight from Parquet.

WHAT THIS IS

  Rocksky holds a full Spotify catalog dump as Parquet files (artists, albums,
  tracks, audio features, images, genres). riff puts DuckDB in front of them and
  answers on Spotify's own paths, with Spotify's own object shapes.

  Pointing a client at it is a base-URL change and nothing else:

      SPOTIFY_API_URL=http://localhost:{port}/v1

  No Spotify credentials, no egress, no rate limits, no 429s. Catalog data only —
  anything user-scoped (/me, player, playlists) is not here and never will be,
  because the dump does not contain it.

ENDPOINTS

  GET  /                                  this page
  GET  /health                            liveness probe

  GET  /v1/search                         ?q=&type=artist,album,track&limit=&offset=
  GET  /v1/artists/{{id}}
  GET  /v1/artists                        ?ids=            (max {max_artists})
  GET  /v1/artists/{{id}}/albums            ?include_groups=album,single,compilation,appears_on
  GET  /v1/artists/{{id}}/top-tracks
  GET  /v1/albums/{{id}}
  GET  /v1/albums                         ?ids=            (max {max_albums})
  GET  /v1/albums/{{id}}/tracks
  GET  /v1/tracks/{{id}}
  GET  /v1/tracks                         ?ids=            (max {max_tracks})
  GET  /v1/audio-features/{{id}}
  GET  /v1/audio-features                 ?ids=            (max {max_features})

SEARCH

  Field filters are supported, which is how Rocksky actually searches:

      /v1/search?type=track&q=track:"Blue Monday" artist:"New Order"

  Recognized: track:  artist:  album:  genre:  isrc:  upc:  year:  (year takes
  2019 or 1990-1999). Bare words match a title, a credited artist or an album.
  Results rank exact-title matches first, then popularity.

LIMITS

  Paging stops at {window} items, same as Spotify, and `total` is capped there.
  `market=` is accepted and ignored — filtering is left to the caller, which can
  read `available_markets` off the response.
"#,
        version = env!("CARGO_PKG_VERSION"),
        port = crate::listen_port(),
        max_artists = MAX_IDS_ARTISTS,
        max_albums = MAX_IDS_ALBUMS,
        max_tracks = MAX_IDS_TRACKS,
        max_features = MAX_IDS_AUDIO_FEATURES,
        window = catalog::MAX_SEARCH_WINDOW,
    );
    HttpResponse::Ok()
        .content_type("text/plain; charset=utf-8")
        .body(body)
}

pub async fn health() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({ "status": "ok" }))
}

// ------------------------------------------------------------------ search

#[derive(Deserialize)]
pub struct SearchParams {
    q: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
}

pub async fn search(
    catalog: web::Data<Catalog>,
    params: web::Query<SearchParams>,
) -> ApiResult<HttpResponse> {
    let raw_q = params.q.clone().unwrap_or_default();
    let parsed = search::parse(&raw_q);
    if parsed.is_empty() {
        return Err(ApiError::BadRequest(
            "No search query specified: parameter q is required".into(),
        ));
    }

    // Spotify defaults to every type when `type` is omitted.
    let kinds = params
        .kind
        .clone()
        .unwrap_or_else(|| "album,artist,track".into());
    let want = |k: &str| kinds.split(',').any(|t| t.trim().eq_ignore_ascii_case(k));
    if !(want("track") || want("artist") || want("album")) {
        return Err(ApiError::BadRequest(format!(
            "Bad search type field: {kinds}"
        )));
    }

    let limit = page_size(params.limit);
    let offset = params.offset.unwrap_or(0);
    if offset + limit > catalog::MAX_SEARCH_WINDOW {
        return Err(ApiError::BadRequest(format!(
            "offset + limit must not exceed {}",
            catalog::MAX_SEARCH_WINDOW
        )));
    }

    let (want_tracks, want_artists, want_albums) = (want("track"), want("artist"), want("album"));
    // The href of each paging object must reproduce the original query.
    let base = format!("/search?q={}&type={}", urlencode(&raw_q), urlencode(&kinds));

    let result = blocking(catalog, move |conn| {
        let tracks = want_tracks
            .then(|| catalog::search_tracks(conn, &parsed, limit, offset))
            .transpose()?
            .map(|(items, total)| Page::new(&base, items, limit, offset, total));
        let artists = want_artists
            .then(|| catalog::search_artists(conn, &parsed, limit, offset))
            .transpose()?
            .map(|(items, total)| Page::new(&base, items, limit, offset, total));
        let albums = want_albums
            .then(|| catalog::search_albums(conn, &parsed, limit, offset))
            .transpose()?
            .map(|(items, total)| Page::new(&base, items, limit, offset, total));
        Ok(SearchResult {
            tracks,
            artists,
            albums,
        })
    })
    .await?;

    Ok(HttpResponse::Ok().json(result))
}

/// Minimal percent-encoding for the query echoed back in paging hrefs.
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

// ----------------------------------------------------------------- artists

pub async fn get_artist(
    catalog: web::Data<Catalog>,
    id: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let id = id.into_inner();
    let artist = blocking(catalog, move |conn| {
        let rowid = catalog::require_row_id(conn, "artists", &id)?;
        catalog::artists(conn, &[rowid])?
            .remove(&rowid)
            .ok_or_else(|| ApiError::NotFound("non existing id".into()))
    })
    .await?;
    Ok(HttpResponse::Ok().json(artist))
}

#[derive(Deserialize)]
pub struct IdsParams {
    ids: Option<String>,
}

pub async fn get_artists(
    catalog: web::Data<Catalog>,
    params: web::Query<IdsParams>,
) -> ApiResult<HttpResponse> {
    let ids = parse_ids(params.ids.as_deref().unwrap_or(""), MAX_IDS_ARTISTS)?;
    let artists = blocking(catalog, move |conn| catalog::artists_by_ids(conn, &ids)).await?;
    Ok(HttpResponse::Ok().json(ManyArtists { artists }))
}

#[derive(Deserialize)]
pub struct ArtistAlbumsParams {
    include_groups: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
}

pub async fn get_artist_albums(
    catalog: web::Data<Catalog>,
    id: web::Path<String>,
    params: web::Query<ArtistAlbumsParams>,
) -> ApiResult<HttpResponse> {
    let id = id.into_inner();
    let limit = page_size(params.limit);
    let offset = params.offset.unwrap_or(0);
    let groups: Vec<String> = params
        .include_groups
        .as_deref()
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_lowercase)
        .collect();

    let page = blocking(catalog, move |conn| {
        let rowid = catalog::require_row_id(conn, "artists", &id)?;
        let (rows, total) = catalog::artist_album_rowids(conn, rowid, &groups, limit, offset)?;
        let album_rowids: Vec<i64> = rows.iter().map(|(r, _)| *r).collect();
        let mut loaded = catalog::simplified_albums(conn, &album_rowids)?;
        let items: Vec<SimplifiedAlbum> = rows
            .iter()
            .filter_map(|(rid, group)| {
                let mut a = loaded.remove(rid)?;
                // `album_group` only exists on this endpoint.
                a.album_group = Some(group.clone());
                Some(a)
            })
            .collect();
        Ok(Page::new(
            &format!("/artists/{id}/albums"),
            items,
            limit,
            offset,
            total,
        ))
    })
    .await?;

    Ok(HttpResponse::Ok().json(page))
}

pub async fn get_artist_top_tracks(
    catalog: web::Data<Catalog>,
    id: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let id = id.into_inner();
    let tracks = blocking(catalog, move |conn| {
        let rowid = catalog::require_row_id(conn, "artists", &id)?;
        let rowids = catalog::artist_top_track_rowids(conn, rowid)?;
        let mut loaded = catalog::tracks(conn, &rowids)?;
        Ok(rowids.iter().filter_map(|r| loaded.remove(r)).collect())
    })
    .await?;
    Ok(HttpResponse::Ok().json(TopTracks { tracks }))
}

// ------------------------------------------------------------------ albums

pub async fn get_album(
    catalog: web::Data<Catalog>,
    id: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let id = id.into_inner();
    let album = blocking(catalog, move |conn| {
        catalog::albums_by_ids(conn, std::slice::from_ref(&id))?
            .pop()
            .flatten()
            .ok_or_else(|| ApiError::NotFound("non existing id".into()))
    })
    .await?;
    Ok(HttpResponse::Ok().json(album))
}

pub async fn get_albums(
    catalog: web::Data<Catalog>,
    params: web::Query<IdsParams>,
) -> ApiResult<HttpResponse> {
    let ids = parse_ids(params.ids.as_deref().unwrap_or(""), MAX_IDS_ALBUMS)?;
    let albums = blocking(catalog, move |conn| catalog::albums_by_ids(conn, &ids)).await?;
    Ok(HttpResponse::Ok().json(ManyAlbums { albums }))
}

#[derive(Deserialize)]
pub struct PageParams {
    limit: Option<u32>,
    offset: Option<u32>,
}

pub async fn get_album_tracks(
    catalog: web::Data<Catalog>,
    id: web::Path<String>,
    params: web::Query<PageParams>,
) -> ApiResult<HttpResponse> {
    let id = id.into_inner();
    let limit = page_size(params.limit);
    let offset = params.offset.unwrap_or(0);

    let page = blocking(catalog, move |conn| {
        let rowid = catalog::require_row_id(conn, "albums", &id)?;
        let (rowids, total) = catalog::album_track_rowids(conn, rowid, limit, offset)?;
        let mut loaded = catalog::simplified_tracks(conn, &rowids)?;
        let items: Vec<SimplifiedTrack> = rowids.iter().filter_map(|r| loaded.remove(r)).collect();
        Ok(Page::new(
            &format!("/albums/{id}/tracks"),
            items,
            limit,
            offset,
            total,
        ))
    })
    .await?;

    Ok(HttpResponse::Ok().json(page))
}

// ------------------------------------------------------------------ tracks

pub async fn get_track(
    catalog: web::Data<Catalog>,
    id: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let id = id.into_inner();
    let track = blocking(catalog, move |conn| {
        catalog::tracks_by_ids(conn, std::slice::from_ref(&id))?
            .pop()
            .flatten()
            .ok_or_else(|| ApiError::NotFound("non existing id".into()))
    })
    .await?;
    Ok(HttpResponse::Ok().json(track))
}

pub async fn get_tracks(
    catalog: web::Data<Catalog>,
    params: web::Query<IdsParams>,
) -> ApiResult<HttpResponse> {
    let ids = parse_ids(params.ids.as_deref().unwrap_or(""), MAX_IDS_TRACKS)?;
    let tracks = blocking(catalog, move |conn| catalog::tracks_by_ids(conn, &ids)).await?;
    Ok(HttpResponse::Ok().json(ManyTracks { tracks }))
}

// ---------------------------------------------------------- audio features

pub async fn get_audio_features(
    catalog: web::Data<Catalog>,
    id: web::Path<String>,
) -> ApiResult<HttpResponse> {
    let id = id.into_inner();
    let features = blocking(catalog, move |conn| {
        catalog::audio_features(conn, std::slice::from_ref(&id))?
            .pop()
            .flatten()
            .ok_or_else(|| ApiError::NotFound("analysis not found".into()))
    })
    .await?;
    Ok(HttpResponse::Ok().json(features))
}

pub async fn get_audio_features_many(
    catalog: web::Data<Catalog>,
    params: web::Query<IdsParams>,
) -> ApiResult<HttpResponse> {
    let ids = parse_ids(params.ids.as_deref().unwrap_or(""), MAX_IDS_AUDIO_FEATURES)?;
    let audio_features = blocking(catalog, move |conn| catalog::audio_features(conn, &ids)).await?;
    Ok(HttpResponse::Ok().json(ManyAudioFeatures { audio_features }))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route("/", web::get().to(index))
        .route("/health", web::get().to(health))
        .service(
            web::scope("/v1")
                .route("/search", web::get().to(search))
                // The collection routes are registered before the `{id}` ones so
                // `/v1/artists?ids=` cannot be swallowed by the path parameter.
                .route("/artists", web::get().to(get_artists))
                .route("/artists/{id}", web::get().to(get_artist))
                .route("/artists/{id}/albums", web::get().to(get_artist_albums))
                .route(
                    "/artists/{id}/top-tracks",
                    web::get().to(get_artist_top_tracks),
                )
                .route("/albums", web::get().to(get_albums))
                .route("/albums/{id}", web::get().to(get_album))
                .route("/albums/{id}/tracks", web::get().to(get_album_tracks))
                .route("/tracks", web::get().to(get_tracks))
                .route("/tracks/{id}", web::get().to(get_track))
                .route("/audio-features", web::get().to(get_audio_features_many))
                .route("/audio-features/{id}", web::get().to(get_audio_features)),
        );
}
