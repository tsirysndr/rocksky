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
use sqlx::{Pool, Postgres};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

use rocksky_navidrome::{
    repo::{self, track::track_select},
    xata::{album::AlbumWithStats, artist::ArtistWithStats, track::TrackWithUpload},
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

pub async fn all_artists(
    pool: &Pool<Postgres>,
    user_id: &str,
) -> Result<Arc<Vec<ArtistWithStats>>, Error> {
    if let Some(rows) = cached(&ARTISTS, user_id) {
        return Ok(rows);
    }
    let rows = repo::artist::get_all_artists(pool, user_id).await?;
    Ok(store(&ARTISTS, user_id, rows))
}

/// Every album in the library, alphabetically — the order most Jellyfin
/// clients ask for by default. Other sort orders are applied over this.
pub async fn all_albums(
    pool: &Pool<Postgres>,
    user_id: &str,
) -> Result<Arc<Vec<AlbumWithStats>>, Error> {
    if let Some(rows) = cached(&ALBUMS, user_id) {
        return Ok(rows);
    }
    // The repo call pages; `i64::MAX` would overflow the planner's estimate, so
    // ask for a bound no real library reaches.
    let rows = repo::album::get_album_list(
        pool,
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
pub async fn count_songs(
    pool: &Pool<Postgres>,
    user_id: &str,
    title_query: &str,
) -> Result<i64, Error> {
    let filter = if title_query.is_empty() {
        ""
    } else {
        "AND LOWER(tracks.title) LIKE LOWER($2)"
    };
    let sql = format!(
        r#"
        SELECT COUNT(DISTINCT tracks.xata_id)
        FROM tracks
        JOIN user_uploads ON tracks.xata_id = user_uploads.track_id
        WHERE user_uploads.user_id = $1
          {filter}
        "#
    );
    let mut q = sqlx::query_scalar::<_, i64>(&sql).bind(user_id);
    if !title_query.is_empty() {
        q = q.bind(format!("%{}%", title_query));
    }
    Ok(q.fetch_one(pool).await?)
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
    pool: &Pool<Postgres>,
    user_id: &str,
    artist_id: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<TrackWithUpload>, Error> {
    let sql = format!(
        r#"
        {}
        WHERE EXISTS (
            SELECT 1 FROM artist_tracks atk
            JOIN artists ar ON ar.xata_id = atk.artist_id
                           AND lower(tracks.album_artist) = lower(ar.name)
            WHERE atk.track_id = tracks.xata_id
              AND atk.artist_id = $2
        )
        ORDER BY tracks.title ASC, tracks.xata_id ASC
        LIMIT $3 OFFSET $4
        "#,
        track_select("$1")
    );
    let rows: Vec<TrackWithUpload> = sqlx::query_as(&sql)
        .bind(user_id)
        .bind(artist_id)
        .bind(count)
        .bind(offset)
        .fetch_all(pool)
        .await?;
    Ok(rows)
}

/// Tracks whose title falls in the range the alpha rail asked for.
///
/// `repo::track::search_tracks` is the query for browse-all and for substring
/// search; it can't express "starts with", which is what the A–Z rail actually
/// means — asking it for `o` would return every title containing an o.
pub async fn songs_filtered(
    pool: &Pool<Postgres>,
    user_id: &str,
    starts_with: Option<&str>,
    geq: Option<&str>,
    less_than: Option<&str>,
    count: i64,
    offset: i64,
) -> Result<Vec<TrackWithUpload>, Error> {
    let (predicate, binds) = title_range_predicate(starts_with, geq, less_than, 2);
    let sql = format!(
        r#"
        {}
        WHERE TRUE {predicate}
        ORDER BY tracks.title ASC, tracks.xata_id ASC
        LIMIT ${limit} OFFSET ${offset}
        "#,
        track_select("$1"),
        limit = binds.len() + 2,
        offset = binds.len() + 3,
    );
    let mut q = sqlx::query_as::<_, TrackWithUpload>(&sql).bind(user_id);
    for b in &binds {
        q = q.bind(b.clone());
    }
    Ok(q.bind(count).bind(offset).fetch_all(pool).await?)
}

pub async fn count_songs_filtered(
    pool: &Pool<Postgres>,
    user_id: &str,
    starts_with: Option<&str>,
    geq: Option<&str>,
    less_than: Option<&str>,
) -> Result<i64, Error> {
    let (predicate, binds) = title_range_predicate(starts_with, geq, less_than, 2);
    let sql = format!(
        r#"
        SELECT COUNT(DISTINCT tracks.xata_id)
        FROM tracks
        JOIN user_uploads ON tracks.xata_id = user_uploads.track_id
        WHERE user_uploads.user_id = $1 {predicate}
        "#
    );
    let mut q = sqlx::query_scalar::<_, i64>(&sql).bind(user_id);
    for b in &binds {
        q = q.bind(b.clone());
    }
    Ok(q.fetch_one(pool).await?)
}

/// Build the title range clause and the values it binds, numbering placeholders
/// from `first`. The clause text is assembled from literals only — every value
/// the caller supplied travels as a bind.
fn title_range_predicate(
    starts_with: Option<&str>,
    geq: Option<&str>,
    less_than: Option<&str>,
    first: usize,
) -> (String, Vec<String>) {
    let mut clause = String::new();
    let mut binds: Vec<String> = Vec::new();
    let mut n = first;

    if let Some(p) = starts_with.filter(|p| !p.is_empty()) {
        clause.push_str(&format!(" AND LOWER(tracks.title) LIKE ${n}"));
        binds.push(format!("{}%", p.to_lowercase()));
        n += 1;
    }
    if let Some(p) = geq.filter(|p| !p.is_empty()) {
        clause.push_str(&format!(" AND LOWER(tracks.title) >= ${n}"));
        binds.push(p.to_lowercase());
        n += 1;
    }
    if let Some(p) = less_than.filter(|p| !p.is_empty()) {
        clause.push_str(&format!(" AND LOWER(tracks.title) < ${n}"));
        binds.push(p.to_lowercase());
    }
    (clause, binds)
}

/// The first cover art in a playlist, for its tile.
pub async fn playlist_cover(pool: &Pool<Postgres>, playlist_id: &str) -> Option<String> {
    let row: Option<(String,)> = sqlx::query_as(
        r#"
        SELECT t.album_art
        FROM navidrome_playlist_tracks pt
        JOIN tracks t ON t.xata_id = pt.track_id
        WHERE pt.playlist_id = $1
          AND t.album_art IS NOT NULL
          AND t.album_art <> ''
        ORDER BY pt.xata_createdat ASC
        LIMIT 1
        "#,
    )
    .bind(playlist_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);
    row.map(|(art,)| art)
}

/// One artist with the album count the browse tiles show. `get_artist_by_id`
/// returns the bare row, which would make every artist page report zero albums.
pub async fn artist_by_id(
    pool: &Pool<Postgres>,
    user_id: &str,
    artist_id: &str,
) -> Result<Option<ArtistWithStats>, Error> {
    let artists = all_artists(pool, user_id).await?;
    Ok(artists.iter().find(|a| a.xata_id == artist_id).cloned())
}

pub async fn artist_by_name(
    pool: &Pool<Postgres>,
    user_id: &str,
    name: &str,
) -> Result<Option<ArtistWithStats>, Error> {
    let artists = all_artists(pool, user_id).await?;
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
