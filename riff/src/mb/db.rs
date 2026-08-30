//! Pool over the imported MusicBrainz DuckDB file.
//!
//! Same shape as `crate::db` for the same reason: `duckdb::Connection` is
//! `Send` but not `Sync`, so each in-flight request checks out its own handle
//! and DuckDB runs them in parallel over one database.

use crate::error::ApiResult;
use crate::mb::ENTITIES;
use duckdb::DuckdbConnectionManager;
use std::collections::HashSet;
use std::path::PathBuf;

pub type Pool = r2d2::Pool<DuckdbConnectionManager>;
pub type PooledConn = r2d2::PooledConnection<DuckdbConnectionManager>;

pub struct MbCatalog {
    pool: Pool,
}

impl MbCatalog {
    pub fn get(&self) -> ApiResult<PooledConn> {
        Ok(self.pool.get()?)
    }
}

pub struct Settings {
    pub db_path: PathBuf,
    pub pool_size: u32,
    pub pool_timeout: std::time::Duration,
    /// Open read-write instead of read-only. Only the importer wants this;
    /// read-only lets several processes share the file.
    pub writable: bool,
}

/// Opens the imported database and checks what is actually in it. Returns the
/// pool plus a startup report of which entities are served.
pub fn open(cfg: &Settings) -> Result<(MbCatalog, Vec<String>), String> {
    if !cfg.writable && !cfg.db_path.is_file() {
        return Err(format!(
            "{} does not exist — run riff-mb-import first",
            cfg.db_path.display()
        ));
    }

    let manager = if cfg.writable {
        DuckdbConnectionManager::file(&cfg.db_path)
    } else {
        DuckdbConnectionManager::file_with_flags(
            &cfg.db_path,
            duckdb::Config::default()
                .access_mode(duckdb::AccessMode::ReadOnly)
                .map_err(|e| format!("duckdb config: {e}"))?,
        )
    }
    .map_err(|e| format!("could not open {}: {e}", cfg.db_path.display()))?;

    let pool = r2d2::Pool::builder()
        .max_size(cfg.pool_size)
        .connection_timeout(cfg.pool_timeout)
        .build(manager)
        .map_err(|e| format!("could not build the DuckDB pool: {e}"))?;

    let conn = pool
        .get()
        .map_err(|e| format!("could not open a DuckDB connection: {e}"))?;

    // Point lookups over an indexed file want the OS page cache, not a huge
    // buffer pool — same lesson riff learned in production.
    let memory_limit =
        std::env::var("RIFF_MB_MEMORY_LIMIT").unwrap_or_else(|_| "2GB".to_string());
    conn.execute_batch(&format!(
        "SET memory_limit = '{}'",
        memory_limit.replace('\'', "")
    ))
    .map_err(|e| format!("could not apply RIFF_MB_MEMORY_LIMIT={memory_limit}: {e}"))?;

    let present = tables(&conn)?;
    let mut report = Vec::new();
    for e in ENTITIES {
        if present.contains(e.table) {
            let n: u64 = conn
                .query_row(&format!("SELECT count(*) FROM {}", e.table), [], |r| {
                    r.get(0)
                })
                .map_err(|e| format!("counting: {e}"))?;
            report.push(format!("  {:<14} {n} rows", e.path));
        } else {
            report.push(format!("  {:<14} not imported — 404s", e.path));
        }
    }

    drop(conn);
    Ok((MbCatalog { pool }, report))
}

/// The set of entity tables present in the file.
pub fn tables(conn: &duckdb::Connection) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare("SELECT table_name FROM information_schema.tables")
        .map_err(|e| format!("listing tables: {e}"))?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| format!("listing tables: {e}"))?;
    rows.collect::<Result<HashSet<_>, _>>()
        .map_err(|e| format!("listing tables: {e}"))
}
