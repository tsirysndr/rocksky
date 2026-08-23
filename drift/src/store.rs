use crate::models::Recommendation;
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
        self.conn()
            .and_then(|c| {
                c.query_row(
                    "SELECT count(*) FROM information_schema.tables
                     WHERE table_name = 'recommendations'",
                    [],
                    |r| r.get::<_, i64>(0),
                )
                .map_err(|e| e.to_string())
            })
            .map(|n| n > 0)
            .unwrap_or(false)
    }

    /// Full precomputed list for a DID or handle, in rank order.
    pub fn get(&self, key: &str) -> Result<Vec<Recommendation>, String> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT title, artist, album, album_art, track_uri, artist_uri,
                        album_uri, genres_json, score, source, likes_count
                 FROM recommendations
                 WHERE did = ?1 OR handle = ?1
                 ORDER BY final_rank",
            )
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
