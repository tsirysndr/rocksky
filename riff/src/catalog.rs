//! Everything that touches DuckDB.
//!
//! Two rules shape the SQL here:
//!
//! 1. **No N+1.** A request resolves ids, then issues one query per related
//!    relation over the whole batch of row ids. On parquet backed by hundreds of
//!    millions of rows, a per-item query is a per-item full scan.
//! 2. **Row ids for joins, Spotify ids at the edges.** `id` is the base62
//!    Spotify id and only ever appears in the first lookup and the last render;
//!    every join in between goes through `row_id`.

use crate::db::PooledConn;
use crate::error::{ApiError, ApiResult};
use crate::models::*;
use crate::search::{self, Built};
use duckdb::{params_from_iter, types::Value};
use std::collections::HashMap;

/// Spotify refuses `offset + limit > 1000` on search and reports totals capped
/// accordingly. Matching that is not just compatibility: an exact `COUNT(*)`
/// over the tracks parquet is a full scan, so the cap is what keeps a search
/// bounded.
pub const MAX_SEARCH_WINDOW: u32 = 1000;

/// Spotify returns at most 10 entries from `/artists/{id}/top-tracks`.
const TOP_TRACKS: usize = 10;

fn placeholders(n: usize) -> String {
    let mut s = String::with_capacity(n * 2);
    for i in 0..n {
        if i > 0 {
            s.push(',');
        }
        s.push('?');
    }
    s
}

/// Row ids are `i64` read out of the catalog, never user input, so inlining
/// them is safe and avoids a prepared statement with a variable arity.
fn inline(rowids: &[i64]) -> String {
    rowids
        .iter()
        .map(i64::to_string)
        .collect::<Vec<_>>()
        .join(",")
}

fn text_params(ids: &[String]) -> impl Iterator<Item = Value> + '_ {
    ids.iter().map(|s| Value::Text(s.clone()))
}

/// Groups `(key, value)` pairs into a map, preserving the SQL result order
/// within each key.
fn group<K: std::hash::Hash + Eq, V>(pairs: Vec<(K, V)>) -> HashMap<K, Vec<V>> {
    let mut out: HashMap<K, Vec<V>> = HashMap::new();
    for (k, v) in pairs {
        out.entry(k).or_default().push(v);
    }
    out
}

// ---------------------------------------------------------------- id lookup

/// Maps Spotify ids onto row ids. Ids absent from the catalog are simply absent
/// from the map; callers turn that into a `null` entry or a 404.
/// Goes through the `*_ids` maps, not the base relations: the parquet files are
/// sorted by rowid, so an id lookup there is a full scan of the id column. The
/// maps are sorted by id, which zone maps turn into a point lookup.
fn row_ids(conn: &PooledConn, table: &str, ids: &[String]) -> ApiResult<HashMap<String, i64>> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let map = match table {
        "tracks" => "track_ids",
        "artists" => "artist_ids",
        "albums" => "album_ids",
        other => other,
    };
    let sql = format!(
        "SELECT id, row_id FROM {map} WHERE id IN ({})",
        placeholders(ids.len())
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(text_params(ids)), |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
    })?;
    let mut out = HashMap::new();
    for row in rows {
        let (id, row_id) = row?;
        out.insert(id, row_id);
    }
    Ok(out)
}

// ------------------------------------------------------------- side tables

fn images(
    conn: &PooledConn,
    table: &str,
    key: &str,
    rowids: &[i64],
) -> ApiResult<HashMap<i64, Vec<Image>>> {
    if rowids.is_empty() {
        return Ok(HashMap::new());
    }
    // Spotify orders images widest-first and clients routinely take `images[0]`
    // as "the cover", so the ordering is part of the contract.
    let sql = format!(
        "SELECT {key}, url, width, height FROM {table} WHERE {key} IN ({}) \
         ORDER BY {key}, COALESCE(width, 0) DESC",
        inline(rowids)
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            Image {
                url: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                width: r.get::<_, Option<i64>>(2)?,
                height: r.get::<_, Option<i64>>(3)?,
            },
        ))
    })?;
    Ok(group(rows.collect::<Result<Vec<_>, _>>()?))
}

fn genres(conn: &PooledConn, artist_rowids: &[i64]) -> ApiResult<HashMap<i64, Vec<String>>> {
    if artist_rowids.is_empty() {
        return Ok(HashMap::new());
    }
    let sql = format!(
        "SELECT artist_rowid, genre FROM artist_genres WHERE artist_rowid IN ({}) \
         AND genre IS NOT NULL ORDER BY artist_rowid, genre",
        inline(artist_rowids)
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
    Ok(group(rows.collect::<Result<Vec<_>, _>>()?))
}

/// `available_markets` is stored once per distinct market set and referenced by
/// row id from both albums and tracks, so a batch of 50 tracks usually costs one
/// lookup of a handful of rows.
fn markets(conn: &PooledConn, market_rowids: &[i64]) -> ApiResult<HashMap<i64, Vec<String>>> {
    if market_rowids.is_empty() {
        return Ok(HashMap::new());
    }
    let sql = format!(
        "SELECT row_id, markets FROM available_markets WHERE row_id IN ({})",
        inline(market_rowids)
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, Option<String>>(1)?))
    })?;
    let mut out = HashMap::new();
    for row in rows {
        let (id, raw) = row?;
        out.insert(id, split_markets(raw.as_deref().unwrap_or_default()));
    }
    Ok(out)
}

/// Splits the `available_markets` cell into ISO-3166-1 alpha-2 codes.
///
/// The column is a `VARCHAR` whose internal encoding is not pinned down by the
/// dump's schema, so this accepts the plausible spellings rather than betting on
/// one: `US,CA`, `US CA`, `["US","CA"]`. Separators and JSON punctuation are
/// stripped; anything left non-empty is a market. Guessing a single format and
/// being wrong would yield one bogus market per row instead of a visible error.
fn split_markets(raw: &str) -> Vec<String> {
    raw.split(|c: char| c == ',' || c == ';' || c.is_whitespace())
        .map(|s| s.trim_matches(|c: char| matches!(c, '"' | '\'' | '[' | ']' | '{' | '}')))
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

fn album_artists(
    conn: &PooledConn,
    album_rowids: &[i64],
) -> ApiResult<HashMap<i64, Vec<SimplifiedArtist>>> {
    if album_rowids.is_empty() {
        return Ok(HashMap::new());
    }
    // `is_appears_on` marks a compilation credit; those artists are not the
    // album's own artists and must not show up in `album.artists[]`.
    let sql = format!(
        "SELECT aa.album_rowid, ar.id, ar.name \
         FROM artist_albums_by_album aa JOIN artists ar ON ar.row_id = aa.artist_rowid \
         WHERE aa.album_rowid IN ({}) AND COALESCE(aa.is_appears_on, 0) = 0 \
         ORDER BY aa.album_rowid, COALESCE(aa.index_in_album, 0)",
        inline(album_rowids)
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            SimplifiedArtist::new(r.get::<_, String>(1)?, r.get::<_, String>(2)?),
        ))
    })?;
    Ok(group(rows.collect::<Result<Vec<_>, _>>()?))
}

fn track_artists(
    conn: &PooledConn,
    track_rowids: &[i64],
) -> ApiResult<HashMap<i64, Vec<SimplifiedArtist>>> {
    if track_rowids.is_empty() {
        return Ok(HashMap::new());
    }
    let sql = format!(
        "SELECT ta.track_rowid, ar.id, ar.name \
         FROM track_artists ta JOIN artists ar ON ar.row_id = ta.artist_rowid \
         WHERE ta.track_rowid IN ({}) \
         ORDER BY ta.track_rowid, COALESCE(ta.index_in_track, 0)",
        inline(track_rowids)
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            SimplifiedArtist::new(r.get::<_, String>(1)?, r.get::<_, String>(2)?),
        ))
    })?;
    Ok(group(rows.collect::<Result<Vec<_>, _>>()?))
}

// ----------------------------------------------------------------- artists

struct ArtistCore {
    row_id: i64,
    id: String,
    name: String,
    followers_total: Option<i64>,
    popularity: Option<i64>,
}

pub fn artists(conn: &PooledConn, rowids: &[i64]) -> ApiResult<HashMap<i64, Artist>> {
    if rowids.is_empty() {
        return Ok(HashMap::new());
    }
    let sql = format!(
        "SELECT row_id, id, name, followers_total, popularity FROM artists WHERE row_id IN ({})",
        inline(rowids)
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows: Vec<ArtistCore> = stmt
        .query_map([], |r| {
            Ok(ArtistCore {
                row_id: r.get(0)?,
                id: r.get(1)?,
                name: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                followers_total: r.get(3)?,
                popularity: r.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?;

    let mut imgs = images(conn, "artist_images", "artist_rowid", rowids)?;
    let mut gs = genres(conn, rowids)?;

    Ok(rows
        .into_iter()
        .map(|c| {
            (
                c.row_id,
                Artist {
                    base: SimplifiedArtist::new(c.id, c.name),
                    followers: Followers {
                        href: None,
                        total: c.followers_total.unwrap_or(0),
                    },
                    genres: gs.remove(&c.row_id).unwrap_or_default(),
                    images: imgs.remove(&c.row_id).unwrap_or_default(),
                    popularity: c.popularity.unwrap_or(0),
                },
            )
        })
        .collect())
}

pub fn artists_by_ids(conn: &PooledConn, ids: &[String]) -> ApiResult<Vec<Option<Artist>>> {
    let map = row_ids(conn, "artists", ids)?;
    let rowids: Vec<i64> = map.values().copied().collect();
    let mut loaded = artists(conn, &rowids)?;
    Ok(ids
        .iter()
        .map(|id| map.get(id).and_then(|rid| loaded.remove(rid)))
        .collect())
}

// ------------------------------------------------------------------ albums

/// The album columns that only `/albums/{id}` needs — kept out of `AlbumCore`
/// so the simplified-album path does not read them.
#[derive(Clone, Default)]
struct AlbumExtras {
    upc: Option<String>,
    amgid: Option<String>,
    copyright_c: Option<String>,
    copyright_p: Option<String>,
    label: Option<String>,
    popularity: Option<i64>,
}

struct AlbumCore {
    row_id: i64,
    id: String,
    name: String,
    album_type: Option<String>,
    release_date: Option<String>,
    release_date_precision: Option<String>,
    total_tracks: Option<i64>,
    markets_rowid: Option<i64>,
}

fn album_cores(conn: &PooledConn, rowids: &[i64]) -> ApiResult<Vec<AlbumCore>> {
    if rowids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!(
        "SELECT row_id, id, name, album_type, release_date, release_date_precision, \
                total_tracks, available_markets_rowid \
         FROM albums WHERE row_id IN ({})",
        inline(rowids)
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| {
        Ok(AlbumCore {
            row_id: r.get(0)?,
            id: r.get(1)?,
            name: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            album_type: r.get(3)?,
            release_date: r.get(4)?,
            release_date_precision: r.get(5)?,
            total_tracks: r.get(6)?,
            markets_rowid: r.get(7)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn build_simplified_albums(
    conn: &PooledConn,
    cores: Vec<AlbumCore>,
) -> ApiResult<HashMap<i64, SimplifiedAlbum>> {
    let rowids: Vec<i64> = cores.iter().map(|c| c.row_id).collect();
    let mut artists_by_album = album_artists(conn, &rowids)?;
    let mut imgs = images(conn, "album_images", "album_rowid", &rowids)?;

    let market_ids: Vec<i64> = {
        let mut v: Vec<i64> = cores.iter().filter_map(|c| c.markets_rowid).collect();
        v.sort_unstable();
        v.dedup();
        v
    };
    let market_map = markets(conn, &market_ids)?;

    Ok(cores
        .into_iter()
        .map(|c| {
            let row_id = c.row_id;
            let album = SimplifiedAlbum {
                album_type: c.album_type.unwrap_or_else(|| "album".into()),
                album_group: None,
                artists: artists_by_album.remove(&row_id).unwrap_or_default(),
                available_markets: c
                    .markets_rowid
                    .and_then(|m| market_map.get(&m).cloned())
                    .unwrap_or_default(),
                external_urls: ExternalUrls::new("album", &c.id),
                href: href("albums", &c.id),
                images: imgs.remove(&row_id).unwrap_or_default(),
                name: c.name,
                release_date: c.release_date.unwrap_or_default(),
                release_date_precision: c.release_date_precision.unwrap_or_else(|| "day".into()),
                total_tracks: c.total_tracks.unwrap_or(0),
                kind: "album",
                uri: uri("album", &c.id),
                id: c.id,
            };
            (row_id, album)
        })
        .collect())
}

pub fn simplified_albums(
    conn: &PooledConn,
    rowids: &[i64],
) -> ApiResult<HashMap<i64, SimplifiedAlbum>> {
    let cores = album_cores(conn, rowids)?;
    build_simplified_albums(conn, cores)
}

pub fn albums_by_ids(conn: &PooledConn, ids: &[String]) -> ApiResult<Vec<Option<Album>>> {
    let map = row_ids(conn, "albums", ids)?;
    let rowids: Vec<i64> = map.values().copied().collect();
    if rowids.is_empty() {
        return Ok(ids.iter().map(|_| None).collect());
    }

    let mut base = simplified_albums(conn, &rowids)?;

    let sql = format!(
        "SELECT row_id, external_id_upc, external_id_amgid, copyright_c, copyright_p, label, popularity \
         FROM albums WHERE row_id IN ({})",
        inline(&rowids)
    );
    let mut stmt = conn.prepare(&sql)?;
    let extras: HashMap<i64, AlbumExtras> = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                AlbumExtras {
                    upc: r.get(1)?,
                    amgid: r.get(2)?,
                    copyright_c: r.get(3)?,
                    copyright_p: r.get(4)?,
                    label: r.get(5)?,
                    popularity: r.get(6)?,
                },
            ))
        })?
        .collect::<Result<_, _>>()?;

    let mut out = HashMap::new();
    for rid in &rowids {
        let Some(mut b) = base.remove(rid) else {
            continue;
        };
        let AlbumExtras {
            upc,
            amgid,
            copyright_c: c,
            copyright_p: p,
            label,
            popularity,
        } = extras.get(rid).cloned().unwrap_or_default();

        // `/albums/{id}` embeds the first page of tracks.
        let (track_rowids, total) = album_track_rowids(conn, *rid, 50, 0)?;
        let mut simple = simplified_tracks(conn, &track_rowids)?;
        let items: Vec<SimplifiedTrack> = track_rowids
            .iter()
            .filter_map(|t| simple.remove(t))
            .collect();
        let tracks_page = Page::new(&format!("/albums/{}/tracks", b.id), items, 50, 0, total);

        b.album_group = None;
        out.insert(
            *rid,
            Album {
                copyrights: [(c, "C"), (p, "P")]
                    .into_iter()
                    .filter_map(|(text, kind)| {
                        text.filter(|t| !t.trim().is_empty())
                            .map(|text| Copyright { text, kind })
                    })
                    .collect(),
                external_ids: AlbumExternalIds { upc, amgid },
                genres: Vec::new(),
                label,
                popularity: popularity.unwrap_or(0),
                tracks: tracks_page,
                base: b,
            },
        );
    }

    Ok(ids
        .iter()
        .map(|id| map.get(id).and_then(|rid| out.remove(rid)))
        .collect())
}

/// Row ids of an album's tracks, in disc/track order, plus the album's total.
pub fn album_track_rowids(
    conn: &PooledConn,
    album_rowid: i64,
    limit: u32,
    offset: u32,
) -> ApiResult<(Vec<i64>, i64)> {
    let mut stmt = conn.prepare(
        "SELECT row_id FROM tracks WHERE album_rowid = ? \
         ORDER BY COALESCE(disc_number, 1), COALESCE(track_number, 0), row_id \
         LIMIT ? OFFSET ?",
    )?;
    let rowids: Vec<i64> = stmt
        .query_map(
            params_from_iter([
                Value::BigInt(album_rowid),
                Value::BigInt(limit as i64),
                Value::BigInt(offset as i64),
            ]),
            |r| r.get(0),
        )?
        .collect::<Result<_, _>>()?;

    let mut count = conn.prepare("SELECT COUNT(*) FROM tracks WHERE album_rowid = ?")?;
    let total: i64 =
        count.query_row(params_from_iter([Value::BigInt(album_rowid)]), |r| r.get(0))?;
    Ok((rowids, total))
}

// ------------------------------------------------------------------ tracks

struct TrackCore {
    row_id: i64,
    id: String,
    name: String,
    preview_url: Option<String>,
    album_rowid: Option<i64>,
    track_number: Option<i64>,
    disc_number: Option<i64>,
    duration_ms: Option<i64>,
    explicit: Option<i64>,
    isrc: Option<String>,
    popularity: Option<i64>,
    markets_rowid: Option<i64>,
}

fn track_cores(conn: &PooledConn, rowids: &[i64]) -> ApiResult<Vec<TrackCore>> {
    if rowids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!(
        "SELECT row_id, id, name, preview_url, album_rowid, track_number, disc_number, \
                duration_ms, explicit, external_id_isrc, popularity, available_markets_rowid \
         FROM tracks WHERE row_id IN ({})",
        inline(rowids)
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| {
        Ok(TrackCore {
            row_id: r.get(0)?,
            id: r.get(1)?,
            name: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            preview_url: r.get(3)?,
            album_rowid: r.get(4)?,
            track_number: r.get(5)?,
            disc_number: r.get(6)?,
            duration_ms: r.get(7)?,
            explicit: r.get(8)?,
            isrc: r.get(9)?,
            popularity: r.get(10)?,
            markets_rowid: r.get(11)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn simplify(
    core: &TrackCore,
    artists: Vec<SimplifiedArtist>,
    available_markets: Vec<String>,
) -> SimplifiedTrack {
    SimplifiedTrack {
        artists,
        available_markets,
        disc_number: core.disc_number.unwrap_or(1),
        duration_ms: core.duration_ms.unwrap_or(0),
        explicit: core.explicit.unwrap_or(0) != 0,
        external_urls: ExternalUrls::new("track", &core.id),
        href: href("tracks", &core.id),
        id: core.id.clone(),
        is_local: false,
        name: core.name.clone(),
        preview_url: core.preview_url.clone(),
        track_number: core.track_number.unwrap_or(0),
        kind: "track",
        uri: uri("track", &core.id),
    }
}

fn market_map_for(conn: &PooledConn, cores: &[TrackCore]) -> ApiResult<HashMap<i64, Vec<String>>> {
    let mut ids: Vec<i64> = cores.iter().filter_map(|c| c.markets_rowid).collect();
    ids.sort_unstable();
    ids.dedup();
    markets(conn, &ids)
}

pub fn simplified_tracks(
    conn: &PooledConn,
    rowids: &[i64],
) -> ApiResult<HashMap<i64, SimplifiedTrack>> {
    let cores = track_cores(conn, rowids)?;
    let mut arts = track_artists(conn, rowids)?;
    let market_map = market_map_for(conn, &cores)?;

    Ok(cores
        .into_iter()
        .map(|c| {
            let m = c
                .markets_rowid
                .and_then(|m| market_map.get(&m).cloned())
                .unwrap_or_default();
            let t = simplify(&c, arts.remove(&c.row_id).unwrap_or_default(), m);
            (c.row_id, t)
        })
        .collect())
}

pub fn tracks(conn: &PooledConn, rowids: &[i64]) -> ApiResult<HashMap<i64, Track>> {
    let cores = track_cores(conn, rowids)?;
    if cores.is_empty() {
        return Ok(HashMap::new());
    }
    let mut arts = track_artists(conn, rowids)?;
    let market_map = market_map_for(conn, &cores)?;

    let album_ids: Vec<i64> = {
        let mut v: Vec<i64> = cores.iter().filter_map(|c| c.album_rowid).collect();
        v.sort_unstable();
        v.dedup();
        v
    };
    let album_map = simplified_albums(conn, &album_ids)?;

    let mut out = HashMap::new();
    for c in cores {
        let m = c
            .markets_rowid
            .and_then(|m| market_map.get(&m).cloned())
            .unwrap_or_default();
        let base = simplify(&c, arts.remove(&c.row_id).unwrap_or_default(), m);
        // A track whose album row is missing still renders; the album object is
        // just an empty shell. Better a usable track than a 500.
        let album = c
            .album_rowid
            .and_then(|a| album_map.get(&a))
            .cloned()
            .unwrap_or_else(empty_album);
        out.insert(
            c.row_id,
            Track {
                album,
                external_ids: TrackExternalIds { isrc: c.isrc },
                popularity: c.popularity.unwrap_or(0),
                base,
            },
        );
    }
    Ok(out)
}

pub fn tracks_by_ids(conn: &PooledConn, ids: &[String]) -> ApiResult<Vec<Option<Track>>> {
    let map = row_ids(conn, "tracks", ids)?;
    let rowids: Vec<i64> = map.values().copied().collect();
    let mut loaded = tracks(conn, &rowids)?;
    Ok(ids
        .iter()
        .map(|id| map.get(id).and_then(|rid| loaded.remove(rid)))
        .collect())
}

fn empty_album() -> SimplifiedAlbum {
    SimplifiedAlbum {
        album_type: "album".into(),
        album_group: None,
        artists: Vec::new(),
        available_markets: Vec::new(),
        external_urls: ExternalUrls::new("album", ""),
        href: href("albums", ""),
        images: Vec::new(),
        name: String::new(),
        release_date: String::new(),
        release_date_precision: "day".into(),
        total_tracks: 0,
        kind: "album",
        uri: uri("album", ""),
        id: String::new(),
    }
}

// ---------------------------------------------------------- audio features

/// The audio-features parquet stores every column as `VARCHAR`, so the numeric
/// shape is restored here with `TRY_CAST`: one malformed cell becomes a null
/// field rather than failing the whole request.
pub fn audio_features(conn: &PooledConn, ids: &[String]) -> ApiResult<Vec<Option<AudioFeatures>>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!(
        "SELECT track_id, null_response, \
                TRY_CAST(duration_ms AS BIGINT), TRY_CAST(time_signature AS BIGINT), \
                TRY_CAST(tempo AS DOUBLE), TRY_CAST(\"key\" AS BIGINT), TRY_CAST(\"mode\" AS BIGINT), \
                TRY_CAST(danceability AS DOUBLE), TRY_CAST(energy AS DOUBLE), \
                TRY_CAST(loudness AS DOUBLE), TRY_CAST(speechiness AS DOUBLE), \
                TRY_CAST(acousticness AS DOUBLE), TRY_CAST(instrumentalness AS DOUBLE), \
                TRY_CAST(liveness AS DOUBLE), TRY_CAST(valence AS DOUBLE) \
         FROM track_audio_features WHERE track_id IN ({})",
        placeholders(ids.len())
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(text_params(ids)), |r| {
        let id: String = r.get(0)?;
        let null_response: Option<String> = r.get(1)?;
        Ok((
            id.clone(),
            AudioFeatures {
                duration_ms: r.get(2)?,
                time_signature: r.get(3)?,
                tempo: r.get(4)?,
                key: r.get(5)?,
                mode: r.get(6)?,
                danceability: r.get(7)?,
                energy: r.get(8)?,
                loudness: r.get(9)?,
                speechiness: r.get(10)?,
                acousticness: r.get(11)?,
                instrumentalness: r.get(12)?,
                liveness: r.get(13)?,
                valence: r.get(14)?,
                analysis_url: format!("{API_BASE}/audio-analysis/{id}"),
                track_href: href("tracks", &id),
                kind: "audio_features",
                uri: uri("track", &id),
                id,
            },
            is_truthy(null_response.as_deref()),
        ))
    })?;

    let mut found = HashMap::new();
    for row in rows {
        let (id, features, null_response) = row?;
        // `null_response` records that Spotify itself had no features for the
        // track. Returning the zeroed row would be worse than honest null.
        found.insert(id, if null_response { None } else { Some(features) });
    }

    Ok(ids
        .iter()
        .map(|id| found.get(id).cloned().flatten())
        .collect())
}

fn is_truthy(v: Option<&str>) -> bool {
    matches!(
        v.map(str::trim).map(str::to_ascii_lowercase).as_deref(),
        Some("1") | Some("true") | Some("t") | Some("yes")
    )
}

// ------------------------------------------------------------ artist views

pub fn artist_album_rowids(
    conn: &PooledConn,
    artist_rowid: i64,
    include_groups: &[String],
    limit: u32,
    offset: u32,
) -> ApiResult<(Vec<(i64, String)>, i64)> {
    // Spotify's `album_group` is the *relationship*, not the album's own type:
    // an album the artist merely appears on is grouped `appears_on` regardless
    // of whether it is itself an album or a compilation.
    // `artist_albums_expanded` carries album_type and release_date precisely so
    // this listing never joins the albums relation — sorted by artist_rowid, the
    // whole page is one pruned scan.
    let group_expr = "CASE WHEN COALESCE(aa.is_appears_on, 0) <> 0 THEN 'appears_on' \
                      ELSE COALESCE(aa.album_type, 'album') END";

    let filter = if include_groups.is_empty() {
        String::new()
    } else {
        format!(
            " AND {group_expr} IN ({})",
            placeholders(include_groups.len())
        )
    };

    let from = format!("FROM artist_albums_expanded aa WHERE aa.artist_rowid = ?{filter}");

    let sql = format!(
        "SELECT aa.album_rowid, {group_expr} AS album_group {from} \
         ORDER BY aa.release_date DESC NULLS LAST, aa.album_rowid LIMIT ? OFFSET ?"
    );
    let mut params: Vec<Value> = vec![Value::BigInt(artist_rowid)];
    params.extend(text_params(include_groups));
    let mut page_params = params.clone();
    page_params.push(Value::BigInt(limit as i64));
    page_params.push(Value::BigInt(offset as i64));

    let mut stmt = conn.prepare(&sql)?;
    let rows: Vec<(i64, String)> = stmt
        .query_map(params_from_iter(page_params), |r| {
            Ok((r.get(0)?, r.get(1)?))
        })?
        .collect::<Result<_, _>>()?;

    let mut count = conn.prepare(&format!("SELECT COUNT(*) {from}"))?;
    let total: i64 = count.query_row(params_from_iter(params), |r| r.get(0))?;
    Ok((rows, total))
}

pub fn artist_top_track_rowids(conn: &PooledConn, artist_rowid: i64) -> ApiResult<Vec<i64>> {
    // `track_artists_by_artist` is sorted by artist and carries popularity, so
    // ranking an artist's tracks never touches the 23G tracks relation.
    let mut stmt = conn.prepare(
        "SELECT track_rowid FROM track_artists_by_artist \
         WHERE artist_rowid = ? \
         ORDER BY COALESCE(popularity, 0) DESC, track_rowid LIMIT ?",
    )?;
    Ok(stmt
        .query_map(
            params_from_iter([
                Value::BigInt(artist_rowid),
                Value::BigInt(TOP_TRACKS as i64),
            ]),
            |r| r.get(0),
        )?
        .collect::<Result<_, _>>()?)
}

// ------------------------------------------------------------------ search

/// Runs a built predicate and returns matching row ids plus a **capped** total.
///
/// The total counts at most `MAX_SEARCH_WINDOW` rows. An exact count would mean
/// scanning every matching row of a parquet with hundreds of millions of them,
/// on every search, to produce a number no client can page into anyway.
fn run(
    conn: &PooledConn,
    id_col: &str,
    from: &str,
    built: &Built,
    limit: u32,
    offset: u32,
) -> ApiResult<(Vec<i64>, i64)> {
    let sql = format!(
        "SELECT {id_col} FROM {from} WHERE {} {} LIMIT ? OFFSET ?",
        built.where_sql, built.order_sql
    );
    let mut params = built.where_params.clone();
    params.extend(built.order_params.iter().cloned());
    params.push(Value::BigInt(limit as i64));
    params.push(Value::BigInt(offset as i64));

    let mut stmt = conn.prepare(&sql)?;
    let rowids: Vec<i64> = stmt
        .query_map(params_from_iter(params), |r| r.get(0))?
        .collect::<Result<_, _>>()?;

    let count_sql = format!(
        "SELECT COUNT(*) FROM (SELECT {id_col} FROM {from} WHERE {} LIMIT {MAX_SEARCH_WINDOW}) s",
        built.where_sql
    );
    let mut count = conn.prepare(&count_sql)?;
    let total: i64 = count.query_row(params_from_iter(built.where_params.clone()), |r| r.get(0))?;

    Ok((rowids, total))
}

pub fn search_tracks(
    conn: &PooledConn,
    q: &search::SearchQuery,
    limit: u32,
    offset: u32,
) -> ApiResult<(Vec<Track>, i64)> {
    let built = search::tracks(q);
    let (rowids, total) = run(conn, "t.row_id", "track_names t", &built, limit, offset)?;
    let mut loaded = tracks(conn, &rowids)?;
    Ok((
        rowids.iter().filter_map(|r| loaded.remove(r)).collect(),
        total,
    ))
}

pub fn search_artists(
    conn: &PooledConn,
    q: &search::SearchQuery,
    limit: u32,
    offset: u32,
) -> ApiResult<(Vec<Artist>, i64)> {
    let built = search::artists(q);
    let (rowids, total) = run(conn, "a.row_id", "artist_names a", &built, limit, offset)?;
    let mut loaded = artists(conn, &rowids)?;
    Ok((
        rowids.iter().filter_map(|r| loaded.remove(r)).collect(),
        total,
    ))
}

pub fn search_albums(
    conn: &PooledConn,
    q: &search::SearchQuery,
    limit: u32,
    offset: u32,
) -> ApiResult<(Vec<SimplifiedAlbum>, i64)> {
    let built = search::albums(q);
    let (rowids, total) = run(conn, "al.row_id", "album_names al", &built, limit, offset)?;
    let mut loaded = simplified_albums(conn, &rowids)?;
    Ok((
        rowids.iter().filter_map(|r| loaded.remove(r)).collect(),
        total,
    ))
}

/// Looks up a single Spotify id, turning "no such row" into a Spotify-shaped 404.
pub fn require_row_id(conn: &PooledConn, table: &str, id: &str) -> ApiResult<i64> {
    row_ids(conn, table, &[id.to_string()])?
        .remove(id)
        .ok_or_else(|| ApiError::NotFound("non existing id".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_comma_separated_markets() {
        assert_eq!(split_markets("US,CA,GB"), vec!["US", "CA", "GB"]);
        assert_eq!(split_markets("US, CA , GB"), vec!["US", "CA", "GB"]);
    }

    /// The dump's schema pins the column as VARCHAR but not its encoding, so
    /// the other plausible spellings must not silently become one bogus market.
    #[test]
    fn splits_the_other_plausible_encodings() {
        assert_eq!(split_markets("US CA GB"), vec!["US", "CA", "GB"]);
        assert_eq!(split_markets(r#"["US","CA"]"#), vec!["US", "CA"]);
        assert_eq!(split_markets("['US', 'CA']"), vec!["US", "CA"]);
    }

    #[test]
    fn empty_and_ragged_input_yields_no_markets() {
        assert!(split_markets("").is_empty());
        assert!(split_markets("   ").is_empty());
        assert!(split_markets(",,").is_empty());
        assert!(split_markets("[]").is_empty());
    }
}
