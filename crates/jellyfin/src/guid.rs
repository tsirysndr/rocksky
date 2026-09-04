//! Jellyfin item ids.
//!
//! Every id a Jellyfin client sees has to be a dashed UUID — the official
//! Kotlin/Java SDKs parse them with `UUID.fromString()` and silently drop any
//! object whose id doesn't match. Rocksky's ids are xata record ids, so each
//! (kind, xata_id) pair is hashed down to a stable UUID and the pair is written
//! to `jellyfin_guids` so `/Items/{guid}` can be reversed later.
//!
//! The mapping is global, not per-user: a guid names a row in the catalogue,
//! and the per-user scoping still happens in the repo queries, which all take a
//! user id. A guid belonging to somebody else's library therefore resolves but
//! returns nothing.

use anyhow::Error;
use sha2::{Digest, Sha256};
use sqlx::{Pool, Postgres};
use std::{
    collections::{HashMap, HashSet},
    sync::{Mutex, OnceLock},
};

pub const KIND_ARTIST: &str = "artist";
pub const KIND_ALBUM: &str = "album";
pub const KIND_SONG: &str = "song";
pub const KIND_PLAYLIST: &str = "playlist";
pub const KIND_GENRE: &str = "genre";
pub const KIND_YEAR: &str = "year";
pub const KIND_LIBRARY: &str = "library";
pub const KIND_USER: &str = "user";

/// Reverse lookups already answered, so a page of 100 items doesn't cost 100
/// round trips. Entries are immutable — a guid is a pure function of its pair —
/// so the only reason to evict is size.
static LOOKUPS: OnceLock<Mutex<HashMap<String, (String, String)>>> = OnceLock::new();

/// Pairs this process has already written. Purely a write-amplification guard:
/// the INSERT is `ON CONFLICT DO NOTHING`, so a miss is harmless.
static WRITTEN: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

const CACHE_LIMIT: usize = 100_000;

fn lookups() -> &'static Mutex<HashMap<String, (String, String)>> {
    LOOKUPS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn written() -> &'static Mutex<HashSet<String>> {
    WRITTEN.get_or_init(|| Mutex::new(HashSet::new()))
}

fn format_as_uuid(hex32: &str) -> String {
    if hex32.len() != 32 {
        return hex32.to_string();
    }
    format!(
        "{}-{}-{}-{}-{}",
        &hex32[0..8],
        &hex32[8..12],
        &hex32[12..16],
        &hex32[16..20],
        &hex32[20..32],
    )
}

/// Stable dashed-UUID id for a (kind, native id) pair.
pub fn guid(kind: &str, native_id: &str) -> String {
    let mut h = Sha256::new();
    h.update(kind.as_bytes());
    h.update(b":");
    h.update(native_id.as_bytes());
    let digest = h.finalize();
    format_as_uuid(&hex::encode(&digest[..16]))
}

/// Accept either the dashed or the un-dashed form from a client and return the
/// dashed, lower-cased form we store. Anything that isn't 32 hex digits is
/// passed through lower-cased, so a caller can hand us a raw string safely.
pub fn normalize(input: &str) -> String {
    let stripped: String = input
        .chars()
        .filter(|c| *c != '-')
        .flat_map(|c| c.to_lowercase())
        .collect();
    if stripped.len() == 32 && stripped.chars().all(|c| c.is_ascii_hexdigit()) {
        format_as_uuid(&stripped)
    } else {
        input.to_ascii_lowercase()
    }
}

pub fn library_guid() -> String {
    guid(KIND_LIBRARY, "music")
}

pub fn playlists_library_guid() -> String {
    guid(KIND_LIBRARY, "playlists")
}

pub fn user_guid(handle: &str) -> String {
    guid(KIND_USER, handle)
}

/// Genres have no table of their own — they come out of `artists.genres` — so
/// the lower-cased name is the native id and the exact casing is what gets
/// remembered, letting a drill-down reproduce it.
pub fn genre_guid(name: &str) -> String {
    guid(KIND_GENRE, &name.to_ascii_lowercase())
}

/// Release years are derived from `albums.year` — no table, so the year itself
/// is the native id.
pub fn year_guid(year: i32) -> String {
    guid(KIND_YEAR, &year.to_string())
}

pub async fn ensure_table(pool: &Pool<Postgres>) -> Result<(), Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS jellyfin_guids (
            guid TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            native_id TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

fn cache_pair(g: &str, kind: &str, native_id: &str) {
    let mut cache = lookups().lock().unwrap();
    if cache.len() >= CACHE_LIMIT {
        cache.clear();
    }
    cache.insert(g.to_string(), (kind.to_string(), native_id.to_string()));
}

/// Record one (kind, native id) pair and return its guid.
pub async fn remember(pool: &Pool<Postgres>, kind: &str, native_id: &str) -> String {
    let g = guid(kind, native_id);
    cache_pair(&g, kind, native_id);

    {
        let seen = written().lock().unwrap();
        if seen.contains(&g) {
            return g;
        }
    }

    let res = sqlx::query(
        r#"
        INSERT INTO jellyfin_guids (guid, kind, native_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (guid) DO NOTHING
        "#,
    )
    .bind(&g)
    .bind(kind)
    .bind(native_id)
    .execute(pool)
    .await;

    match res {
        Ok(_) => {
            let mut seen = written().lock().unwrap();
            if seen.len() >= CACHE_LIMIT {
                seen.clear();
            }
            seen.insert(g.clone());
        }
        Err(e) => tracing::warn!(kind, native_id, "jellyfin: guid insert failed: {}", e),
    }

    g
}

/// Record a genre so `/Items?parentId=<genre guid>` can be reversed.
///
/// Genres need their own entry point because the id is hashed from the
/// lower-cased name — so a client can round-trip either casing — while the
/// value we want back is the exact casing the catalogue stores. Passing the
/// display name to `remember` would file it under a different guid than
/// `genre_guid` hands out, and the drill-down would resolve to nothing.
pub async fn remember_genre(pool: &Pool<Postgres>, name: &str) -> String {
    let g = genre_guid(name);
    cache_pair(&g, KIND_GENRE, name);

    {
        let seen = written().lock().unwrap();
        if seen.contains(&g) {
            return g;
        }
    }

    let res = sqlx::query(
        r#"
        INSERT INTO jellyfin_guids (guid, kind, native_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (guid) DO NOTHING
        "#,
    )
    .bind(&g)
    .bind(KIND_GENRE)
    .bind(name)
    .execute(pool)
    .await;

    match res {
        Ok(_) => {
            let mut seen = written().lock().unwrap();
            if seen.len() >= CACHE_LIMIT {
                seen.clear();
            }
            seen.insert(g.clone());
        }
        Err(e) => tracing::warn!(name, "jellyfin: genre guid insert failed: {}", e),
    }

    g
}

/// Record a whole page of pairs in one statement.
///
/// Emitting a listing would otherwise be one INSERT per row; a 100-item page of
/// songs plus their albums and artists is 300 round trips before a single byte
/// of JSON is written.
pub async fn remember_many(pool: &Pool<Postgres>, kind: &str, native_ids: &[String]) {
    let mut guids: Vec<String> = Vec::with_capacity(native_ids.len());
    let mut natives: Vec<String> = Vec::with_capacity(native_ids.len());

    {
        let seen = written().lock().unwrap();
        for native in native_ids {
            let g = guid(kind, native);
            cache_pair(&g, kind, native);
            if !seen.contains(&g) && !guids.contains(&g) {
                guids.push(g);
                natives.push(native.clone());
            }
        }
    }

    if guids.is_empty() {
        return;
    }

    let kinds = vec![kind.to_string(); guids.len()];
    let res = sqlx::query(
        r#"
        INSERT INTO jellyfin_guids (guid, kind, native_id)
        SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[])
        ON CONFLICT (guid) DO NOTHING
        "#,
    )
    .bind(&guids)
    .bind(&kinds)
    .bind(&natives)
    .execute(pool)
    .await;

    match res {
        Ok(_) => {
            let mut seen = written().lock().unwrap();
            if seen.len() + guids.len() >= CACHE_LIMIT {
                seen.clear();
            }
            seen.extend(guids);
        }
        Err(e) => tracing::warn!(kind, "jellyfin: guid batch insert failed: {}", e),
    }
}

/// Resolve a client-supplied id back to (kind, native id).
pub async fn lookup(pool: &Pool<Postgres>, input: &str) -> Option<(String, String)> {
    let g = normalize(input);

    {
        let cache = lookups().lock().unwrap();
        if let Some(pair) = cache.get(&g) {
            return Some(pair.clone());
        }
    }

    let row: Option<(String, String)> =
        sqlx::query_as(r#"SELECT kind, native_id FROM jellyfin_guids WHERE guid = $1"#)
            .bind(&g)
            .fetch_optional(pool)
            .await
            .unwrap_or(None);

    if let Some((kind, native)) = &row {
        cache_pair(&g, kind, native);
    }
    row
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guid_is_a_stable_dashed_uuid() {
        let a = guid(KIND_ALBUM, "rec_abc");
        assert_eq!(a, guid(KIND_ALBUM, "rec_abc"));
        assert_eq!(a.len(), 36);
        assert_eq!(a.as_bytes()[8], b'-');
        assert_eq!(a.as_bytes()[13], b'-');
        assert_eq!(a.as_bytes()[18], b'-');
        assert_eq!(a.as_bytes()[23], b'-');
    }

    #[test]
    fn guid_differs_by_kind() {
        assert_ne!(guid(KIND_ALBUM, "x"), guid(KIND_SONG, "x"));
    }

    #[test]
    fn normalize_accepts_both_forms() {
        let dashed = "01234567-89ab-cdef-0123-456789abcdef";
        assert_eq!(normalize("01234567-89AB-CDEF-0123-456789ABCDEF"), dashed);
        assert_eq!(normalize("0123456789abcdef0123456789abcdef"), dashed);
    }

    #[test]
    fn normalize_passes_non_guids_through() {
        assert_eq!(
            normalize("at://did:plc:x/app.rocksky.album/1"),
            "at://did:plc:x/app.rocksky.album/1"
        );
    }
}
