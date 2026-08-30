use crate::models::{Recommendation, RecommendedAlbum, RecommendedArtist};
use duckdb::DuckdbConnectionManager;

pub type Pool = r2d2::Pool<DuckdbConnectionManager>;
pub type PooledConn = r2d2::PooledConnection<DuckdbConnectionManager>;

/// Serving state lives in a dedicated DuckDB database file (default
/// `recommendations.ddb`): the durable `recommendations` table plus a one-row
/// `meta` table. A restart serves the previous snapshot immediately, and the
/// file is inspectable with the duckdb CLI. Refreshes swap the tables with
/// `CREATE OR REPLACE` on another connection of the same pool — MVCC keeps
/// readers on the old version until the swap commits.
pub struct Store {
    pool: Pool,
}

impl Store {
    pub fn open(path: &str) -> Result<Self, String> {
        let manager = DuckdbConnectionManager::file(path)
            .map_err(|e| format!("could not open {path}: {e}"))?;
        let pool = r2d2::Pool::builder()
            .max_size(4)
            .build(manager)
            .map_err(|e| format!("could not build the DuckDB pool: {e}"))?;
        Ok(Self { pool })
    }

    pub fn conn(&self) -> Result<PooledConn, String> {
        self.pool
            .get()
            .map_err(|e| format!("could not check out a DuckDB connection: {e}"))
    }

    pub fn is_ready(&self) -> bool {
        self.has_table("recommendations")
    }

    /// Whether a snapshot table exists — per-kind, because a pre-upgrade
    /// database file holds `recommendations` but not the artist/album tables
    /// until its first refresh under the new pipeline lands.
    pub fn has_table(&self, name: &str) -> bool {
        self.conn()
            .and_then(|c| {
                c.query_row(
                    "SELECT count(*) FROM information_schema.tables
                     WHERE table_name = ?1",
                    [name],
                    |r| r.get::<_, i64>(0),
                )
                .map_err(|e| e.to_string())
            })
            .map(|n| n > 0)
            .unwrap_or(false)
    }

    /// Full precomputed list for a DID or handle, in rank order.
    ///
    /// The snapshot is sorted by (did, final_rank), so an equality on `did` is
    /// a zone-map-pruned lookup — while `did = ? OR handle = ?` can only be a
    /// full scan, since handles are not clustered under a DID sort. The handle
    /// case therefore resolves through the tiny `rec_users` map first. A
    /// snapshot written before `rec_users` existed (a restart on an old file,
    /// until its first refresh lands) falls back to the old scan.
    pub fn get(&self, key: &str) -> Result<Vec<Recommendation>, String> {
        let conn = self.conn()?;
        match resolve_did(&conn, key) {
            Ok(Some(did)) => query_recommendations(
                &conn,
                "SELECT title, artist, album, album_art, track_uri, artist_uri,
                        album_uri, genres_json, score, source, likes_count
                 FROM recommendations WHERE did = ?1 ORDER BY final_rank",
                &did,
            ),
            Ok(None) => Ok(Vec::new()),
            Err(_) => query_recommendations(
                &conn,
                "SELECT title, artist, album, album_art, track_uri, artist_uri,
                        album_uri, genres_json, score, source, likes_count
                 FROM recommendations WHERE did = ?1 OR handle = ?1 ORDER BY final_rank",
                key,
            ),
        }
    }
    /// Full precomputed artist list for a DID or handle, in rank order.
    /// The artist/album tables only exist in post-upgrade snapshots, which
    /// always carry `rec_users` — so there is no legacy-scan fallback here.
    pub fn get_artists(&self, key: &str) -> Result<Vec<RecommendedArtist>, String> {
        let conn = self.conn()?;
        let Some(did) = resolve_did(&conn, key).map_err(|e| e.to_string())? else {
            return Ok(Vec::new());
        };
        let mut stmt = conn
            .prepare(
                "SELECT artist_id, artist_uri, name, picture, genres_json, score, source
                 FROM artist_recommendations WHERE did = ?1 ORDER BY final_rank",
            )
            .map_err(|e| format!("artist recommendations query failed: {e}"))?;
        let rows = stmt
            .query_map([&did], |row| {
                let genres_json: Option<String> = row.get(4)?;
                Ok(RecommendedArtist {
                    id: row.get(0)?,
                    uri: row.get(1)?,
                    name: row.get(2)?,
                    picture: row.get(3)?,
                    genres: genres_json
                        .and_then(|j| serde_json::from_str(&j).ok())
                        .unwrap_or_default(),
                    recommendation_score: row.get(5)?,
                    source: row.get(6)?,
                })
            })
            .map_err(|e| format!("artist recommendations read failed: {e}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("artist recommendations row failed: {e}"))
    }

    /// Full precomputed album list for a DID or handle, in rank order.
    pub fn get_albums(&self, key: &str) -> Result<Vec<RecommendedAlbum>, String> {
        let conn = self.conn()?;
        let Some(did) = resolve_did(&conn, key).map_err(|e| e.to_string())? else {
            return Ok(Vec::new());
        };
        let mut stmt = conn
            .prepare(
                "SELECT album_id, album_uri, title, artist, artist_uri, year, album_art,
                        score, source
                 FROM album_recommendations WHERE did = ?1 ORDER BY final_rank",
            )
            .map_err(|e| format!("album recommendations query failed: {e}"))?;
        let rows = stmt
            .query_map([&did], |row| {
                Ok(RecommendedAlbum {
                    id: row.get(0)?,
                    uri: row.get(1)?,
                    title: row.get(2)?,
                    artist: row.get(3)?,
                    artist_uri: row.get(4)?,
                    year: row.get(5)?,
                    album_art: row.get(6)?,
                    recommendation_score: row.get(7)?,
                    source: row.get(8)?,
                })
            })
            .map_err(|e| format!("album recommendations read failed: {e}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("album recommendations row failed: {e}"))
    }

    /// (refreshed_at_epoch, took_ms, users, rows)
    pub fn status(&self) -> Option<(u64, u128, usize, usize)> {
        let conn = self.conn().ok()?;
        conn.query_row(
            "SELECT refreshed_at_epoch, took_ms, users, rows_total FROM meta",
            [],
            |r| {
                Ok((
                    r.get::<_, i64>(0)? as u64,
                    r.get::<_, i64>(1)? as u128,
                    r.get::<_, i64>(2)? as usize,
                    r.get::<_, i64>(3)? as usize,
                ))
            },
        )
        .ok()
    }
}

/// The DID behind a DID-or-handle key, from the per-refresh `rec_users` map.
/// Errors (most likely: the table does not exist yet) tell the caller to use
/// the legacy scan instead.
fn resolve_did(conn: &PooledConn, key: &str) -> Result<Option<String>, duckdb::Error> {
    let mut stmt =
        conn.prepare("SELECT did FROM rec_users WHERE did = ?1 OR handle = ?1 LIMIT 1")?;
    let mut rows = stmt.query_map([key], |r| r.get::<_, String>(0))?;
    rows.next().transpose()
}

fn query_recommendations(
    conn: &PooledConn,
    sql: &str,
    key: &str,
) -> Result<Vec<Recommendation>, String> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("recommendations query failed: {e}"))?;
    let rows = stmt
        .query_map([key], |row| {
            let genres_json: Option<String> = row.get(7)?;
            Ok(Recommendation {
                title: row.get(0)?,
                artist: row.get(1)?,
                album: row.get(2)?,
                album_art: row.get(3)?,
                track_uri: row.get(4)?,
                artist_uri: row.get(5)?,
                album_uri: row.get(6)?,
                genres: genres_json
                    .and_then(|j| serde_json::from_str(&j).ok())
                    .unwrap_or_default(),
                recommendation_score: row.get(8)?,
                source: row.get(9)?,
                likes_count: row.get(10)?,
            })
        })
        .map_err(|e| format!("recommendations read failed: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("recommendations row failed: {e}"))
}
