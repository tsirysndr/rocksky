//! The few library reads the Subsonic service has no equivalent for, plus the
//! caching the Jellyfin browse model needs.
//!
//! Jellyfin lists carry an exact `TotalRecordCount` — clients size their
//! scrollers from it, and a wrong one makes pages overlap or the list end
//! early. The artist and album projections are expensive enough (they walk the
//! whole library to compute per-row stats) that running them twice per request,
//! once for the page and once for the count, is not an option. Both fit
//! comfortably in memory for any real library, so they are fetched whole and
//! cached briefly; songs stay paged in SQL with a dedicated count.

use anyhow::Error;
use rocksky_pgurl::Db;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

use rocksky_navidrome::{
    repo::{self, track::track_select},
    schema::{ArtistTracks, Artists, NavidromePlaylistTracks, Tracks, UserUploads},
    sql,
    xata::{album::AlbumWithStats, artist::ArtistWithStats, track::TrackWithUpload},
};
use sea_query::{
    Alias, BinOper, Expr, ExprTrait, Func, JoinType, Order, Query, SelectStatement, SimpleExpr,
};

/// Long enough that browsing an artist → album → track chain costs one fetch,
/// short enough that a fresh upload shows up without the user wondering.
const TTL: Duration = Duration::from_secs(60);

type Cache<T> = OnceLock<Mutex<HashMap<String, (Arc<Vec<T>>, Instant)>>>;

static ARTISTS: Cache<ArtistWithStats> = OnceLock::new();
static ALBUMS: Cache<AlbumWithStats> = OnceLock::new();

fn cache<T>(slot: &'static Cache<T>) -> &'static Mutex<HashMap<String, (Arc<Vec<T>>, Instant)>> {
    slot.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached<T>(slot: &'static Cache<T>, user_id: &str) -> Option<Arc<Vec<T>>> {
    let map = cache(slot).lock().unwrap();
    map.get(user_id)
        .filter(|(_, at)| at.elapsed() < TTL)
        .map(|(rows, _)| Arc::clone(rows))
}

fn store<T>(slot: &'static Cache<T>, user_id: &str, rows: Vec<T>) -> Arc<Vec<T>> {
    let rows = Arc::new(rows);
    let mut map = cache(slot).lock().unwrap();
    map.retain(|_, (_, at)| at.elapsed() < TTL);
    map.insert(user_id.to_string(), (Arc::clone(&rows), Instant::now()));
    rows
}

pub async fn all_artists(db: &Db, user_id: &str) -> Result<Arc<Vec<ArtistWithStats>>, Error> {
    let _pool = db.replica();
    if let Some(rows) = cached(&ARTISTS, user_id) {
        return Ok(rows);
    }
    let rows = repo::artist::get_all_artists(db, user_id).await?;
    Ok(store(&ARTISTS, user_id, rows))
}

/// Every album in the library, alphabetically — the order most Jellyfin
/// clients ask for by default. Other sort orders are applied over this.
pub async fn all_albums(db: &Db, user_id: &str) -> Result<Arc<Vec<AlbumWithStats>>, Error> {
    let _pool = db.replica();
    if let Some(rows) = cached(&ALBUMS, user_id) {
        return Ok(rows);
    }
    // The repo call pages; `i64::MAX` would overflow the planner's estimate, so
    // ask for a bound no real library reaches.
    let rows = repo::album::get_album_list(
        db,
        user_id,
        "alphabeticalByName",
        100_000,
        0,
        None,
        None,
        None,
    )
    .await?;
    Ok(store(&ALBUMS, user_id, rows))
}

/// Number of distinct tracks in the library, optionally narrowed by a title
/// substring. Mirrors the `page` CTE inside `repo::track::search_tracks` so the
/// count and the pages it labels can never disagree.
pub async fn count_songs(db: &Db, user_id: &str, title_query: &str) -> Result<i64, Error> {
    let mut stmt = distinct_track_count(user_id);
    if !title_query.is_empty() {
        stmt.and_where(title_contains(title_query));
    }
    Ok(sql::fetch_scalar(db.replica(), &stmt).await?)
}

/// `SELECT COUNT(DISTINCT tracks.xata_id)` over the caller's library. Callers
/// add their own narrowing.
fn distinct_track_count(user_id: &str) -> SelectStatement {
    Query::select()
        .expr(Func::count_distinct(Expr::col((
            Tracks::Table,
            Tracks::XataId,
        ))))
        .from(Tracks::Table)
        .join(
            JoinType::Join,
            UserUploads::Table,
            Expr::col((Tracks::Table, Tracks::XataId))
                .equals((UserUploads::Table, UserUploads::TrackId)),
        )
        .and_where(Expr::col((UserUploads::Table, UserUploads::UserId)).eq(user_id))
        .take()
}

fn title_contains(query: &str) -> SimpleExpr {
    Func::lower(Expr::col((Tracks::Table, Tracks::Title))).binary(
        BinOper::Like,
        Func::lower(Expr::val(format!("%{}%", query))),
    )
}

/// Every track credited to one artist, paged.
///
/// Built on the Subsonic crate's canonical track projection — same columns,
/// same one-upload-per-track join — so the rows deserialize into
/// `TrackWithUpload` and carry the BYO-storage columns streaming needs.
///
/// The `lower(album_artist) = lower(artists.name)` guard on the junction is not
/// optional: `artist_tracks` holds entries linking tracks to artists that don't
/// credit them, and without it a stray row puts a stranger's track in the
/// caller's artist page.
pub async fn songs_by_artist(
    db: &Db,
    user_id: &str,
    artist_id: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<TrackWithUpload>, Error> {
    let credited = Query::select()
        .expr(Expr::cust("1"))
        .from_as(ArtistTracks::Table, Alias::new("atk"))
        .join_as(
            JoinType::Join,
            Artists::Table,
            Alias::new("ar"),
            Expr::col((Alias::new("ar"), Artists::XataId))
                .equals((Alias::new("atk"), ArtistTracks::ArtistId))
                .and(
                    Func::lower(Expr::col((Tracks::Table, Tracks::AlbumArtist)))
                        .eq(Func::lower(Expr::col((Alias::new("ar"), Artists::Name)))),
                ),
        )
        .and_where(
            Expr::col((Alias::new("atk"), ArtistTracks::TrackId))
                .equals((Tracks::Table, Tracks::XataId)),
        )
        .and_where(Expr::col((Alias::new("atk"), ArtistTracks::ArtistId)).eq(artist_id))
        .take();

    let mut stmt = track_select(user_id);
    stmt.and_where(Expr::exists(credited))
        .order_by((Tracks::Table, Tracks::Title), Order::Asc)
        .order_by((Tracks::Table, Tracks::XataId), Order::Asc)
        .limit(count.max(0) as u64)
        .offset(offset.max(0) as u64);

    Ok(sql::fetch_all(db.replica(), &stmt).await?)
}

/// Tracks whose title falls in the range the alpha rail asked for.
///
/// `repo::track::search_tracks` is the query for browse-all and for substring
/// search; it can't express "starts with", which is what the A–Z rail actually
/// means — asking it for `o` would return every title containing an o.
pub async fn songs_filtered(
    db: &Db,
    user_id: &str,
    starts_with: Option<&str>,
    geq: Option<&str>,
    less_than: Option<&str>,
    count: i64,
    offset: i64,
) -> Result<Vec<TrackWithUpload>, Error> {
    let mut stmt = track_select(user_id);
    for predicate in title_range_predicates(starts_with, geq, less_than) {
        stmt.and_where(predicate);
    }
    stmt.order_by((Tracks::Table, Tracks::Title), Order::Asc)
        .order_by((Tracks::Table, Tracks::XataId), Order::Asc)
        .limit(count.max(0) as u64)
        .offset(offset.max(0) as u64);

    Ok(sql::fetch_all(db.replica(), &stmt).await?)
}

pub async fn count_songs_filtered(
    db: &Db,
    user_id: &str,
    starts_with: Option<&str>,
    geq: Option<&str>,
    less_than: Option<&str>,
) -> Result<i64, Error> {
    let mut stmt = distinct_track_count(user_id);
    for predicate in title_range_predicates(starts_with, geq, less_than) {
        stmt.and_where(predicate);
    }
    Ok(sql::fetch_scalar(db.replica(), &stmt).await?)
}

/// The title range clause, as predicates. This used to hand back a clause and a
/// separate list of values, with the caller numbering `$n` from an offset it
/// had to work out — `songs_filtered` and `count_songs_filtered` bind different
/// things after it, so the offset differed between them. Each value now travels
/// attached to its own comparison.
fn title_range_predicates(
    starts_with: Option<&str>,
    geq: Option<&str>,
    less_than: Option<&str>,
) -> Vec<SimpleExpr> {
    let title = || Func::lower(Expr::col((Tracks::Table, Tracks::Title)));
    let mut out = Vec::new();

    if let Some(p) = starts_with.filter(|p| !p.is_empty()) {
        out.push(title().binary(BinOper::Like, Expr::val(format!("{}%", p.to_lowercase()))));
    }
    if let Some(p) = geq.filter(|p| !p.is_empty()) {
        out.push(title().gte(p.to_lowercase()));
    }
    if let Some(p) = less_than.filter(|p| !p.is_empty()) {
        out.push(title().lt(p.to_lowercase()));
    }
    out
}

/// The first cover art in a playlist, for its tile.
pub async fn playlist_cover(db: &Db, playlist_id: &str) -> Option<String> {
    let stmt = Query::select()
        .column((Alias::new("t"), Tracks::AlbumArt))
        .from_as(NavidromePlaylistTracks::Table, Alias::new("pt"))
        .join_as(
            JoinType::Join,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("pt"), NavidromePlaylistTracks::TrackId)),
        )
        .and_where(
            Expr::col((Alias::new("pt"), NavidromePlaylistTracks::PlaylistId)).eq(playlist_id),
        )
        .and_where(Expr::col((Alias::new("t"), Tracks::AlbumArt)).is_not_null())
        .and_where(Expr::col((Alias::new("t"), Tracks::AlbumArt)).ne(""))
        .order_by(
            (Alias::new("pt"), NavidromePlaylistTracks::XataCreatedat),
            Order::Asc,
        )
        .limit(1)
        .take();

    sql::fetch_scalar_optional(db.replica(), &stmt)
        .await
        .unwrap_or(None)
}

/// One artist with the album count the browse tiles show. `get_artist_by_id`
/// returns the bare row, which would make every artist page report zero albums.
pub async fn artist_by_id(
    db: &Db,
    user_id: &str,
    artist_id: &str,
) -> Result<Option<ArtistWithStats>, Error> {
    let _pool = db.replica();
    let artists = all_artists(db, user_id).await?;
    Ok(artists.iter().find(|a| a.xata_id == artist_id).cloned())
}

pub async fn artist_by_name(
    db: &Db,
    user_id: &str,
    name: &str,
) -> Result<Option<ArtistWithStats>, Error> {
    let _pool = db.replica();
    let artists = all_artists(db, user_id).await?;
    Ok(artists
        .iter()
        .find(|a| a.name.eq_ignore_ascii_case(name))
        .cloned())
}

/// `NameStartsWith` / `NameStartsWithOrGreater` / `NameLessThan` — the alpha
/// jump rail every Jellyfin music client renders down the side of a list.
pub fn name_matches(
    name: &str,
    starts_with: Option<&str>,
    geq: Option<&str>,
    less_than: Option<&str>,
) -> bool {
    let lower = name.to_lowercase();
    if let Some(p) = starts_with.filter(|p| !p.is_empty()) {
        if !lower.starts_with(&p.to_lowercase()) {
            return false;
        }
    }
    if let Some(p) = geq.filter(|p| !p.is_empty()) {
        if lower.as_str() < p.to_lowercase().as_str() {
            return false;
        }
    }
    if let Some(p) = less_than.filter(|p| !p.is_empty()) {
        if lower.as_str() >= p.to_lowercase().as_str() {
            return false;
        }
    }
    true
}

/// The leading letters present in a list of names, for `/Items/Prefixes`.
/// Anything that doesn't start with a letter is bucketed under `#`, which is
/// what the reference server does.
pub fn prefixes_of<'a>(names: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    for name in names {
        let first = name
            .chars()
            .next()
            .map(|c| {
                if c.is_alphabetic() {
                    c.to_uppercase().to_string()
                } else {
                    "#".to_string()
                }
            })
            .unwrap_or_else(|| "#".to_string());
        if !seen.contains(&first) {
            seen.push(first);
        }
    }
    seen.sort();
    seen
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_filters_are_case_insensitive() {
        assert!(name_matches("Daft Punk", Some("da"), None, None));
        assert!(name_matches("Daft Punk", Some("DAFT"), None, None));
        assert!(!name_matches("Daft Punk", Some("z"), None, None));
    }

    #[test]
    fn name_range_is_half_open() {
        assert!(name_matches("m", Some(""), Some("a"), Some("n")));
        assert!(!name_matches("n", None, Some("a"), Some("n")));
        assert!(!name_matches("a", None, Some("b"), None));
    }

    #[test]
    fn prefixes_bucket_non_letters_under_hash() {
        let names = ["Air", "2Pac", "ború", "abba"];
        assert_eq!(prefixes_of(names.iter().copied()), vec!["#", "A", "B"]);
    }
}
