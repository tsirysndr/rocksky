//! Imports the MusicBrainz NDJSON dumps into DuckDB, one entity at a time.
//!
//! Each dump line is kept verbatim in `data`; the extracted columns exist only
//! so lookups and searches are index probes instead of JSON scans. Entities
//! import independently so the caller can delete each dump as soon as its
//! table is verified — the full dump set and the full database never need to
//! fit on disk together.

use crate::mb::{EntitySpec, ENTITIES};
use duckdb::Connection;
use std::path::Path;

/// Dump lines can be large — the longest in the 2025-03 dumps is a 41MB
/// artist. Not larger than needed: the JSON reader's memory use scales with
/// this (buffers of roughly twice it per scan task), so oversizing it is how
/// an import OOMs. The importer exposes it per run; size it just above the
/// entity's longest line (`awk '{if(length($0)>m)m=length($0)}END{print m}'`).
pub const DEFAULT_MAX_OBJECT_SIZE: u64 = 67_108_864;

fn quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// The NDJSON file for an entity inside a dump directory, tolerating both the
/// upstream layout (`<dir>/<entity>/mbdump/<entity>`) and a flat one
/// (`<dir>/<entity>.jsonl`, as in testdata).
pub fn dump_file(dumps_dir: &Path, entity: &EntitySpec) -> Option<std::path::PathBuf> {
    let nested = dumps_dir.join(entity.path).join("mbdump").join(entity.path);
    if nested.is_file() {
        return Some(nested);
    }
    let flat = dumps_dir.join(format!("{}.jsonl", entity.path));
    flat.is_file().then_some(flat)
}

/// Creates the side tables shared by every entity. Idempotent.
pub fn create_shared_tables(conn: &Connection) -> duckdb::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS mb_alias (
             entity VARCHAR NOT NULL,
             entity_id VARCHAR NOT NULL,
             name_lc VARCHAR NOT NULL
         );
         CREATE TABLE IF NOT EXISTS mb_recording_isrc (
             isrc VARCHAR NOT NULL,
             recording_id VARCHAR NOT NULL
         );
         CREATE TABLE IF NOT EXISTS mb_artist_credit (
             entity VARCHAR NOT NULL,
             entity_id VARCHAR NOT NULL,
             artist_id VARCHAR NOT NULL,
             credit_name_lc VARCHAR NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_mb_alias_name ON mb_alias (entity, name_lc);
         CREATE INDEX IF NOT EXISTS idx_mb_artist_credit_name
             ON mb_artist_credit (entity, credit_name_lc);",
    )
}

/// Imports one entity's NDJSON file into its table, replacing any previous
/// import of that entity. Returns the number of rows imported.
pub fn import_entity(
    conn: &Connection,
    entity: &EntitySpec,
    file: &Path,
    max_object_size: u64,
) -> Result<u64, String> {
    let table = entity.table;
    let name_field = entity.name_field;
    let src = quote(&file.display().to_string());

    let sort_name = if entity.has_sort_name {
        "json_extract_string(json, '$.\"sort-name\"')"
    } else {
        "NULL"
    };

    // Everything shares the core shape; a couple of entities carry extra
    // filterable columns worth having (they cost nothing at this point).
    let sql = format!(
        "CREATE OR REPLACE TABLE {table} AS
         SELECT
             json_extract_string(json, '$.id') AS id,
             json_extract_string(json, '$.{name_field}') AS name,
             lower(json_extract_string(json, '$.{name_field}')) AS name_lc,
             {sort_name} AS sort_name,
             json_extract_string(json, '$.disambiguation') AS disambiguation,
             json_extract_string(json, '$.type') AS type,
             CAST(json AS VARCHAR) AS data
         FROM read_ndjson_objects({src}, maximum_object_size={max_object_size})
         WHERE json_extract_string(json, '$.id') IS NOT NULL",
    );
    conn.execute_batch(&sql)
        .map_err(|e| format!("importing {table}: {e}"))?;

    refresh_side_tables(conn, entity).map_err(|e| format!("side tables for {table}: {e}"))?;

    conn.execute_batch(&format!(
        "CREATE INDEX IF NOT EXISTS idx_{table}_id ON {table} (id);
         CREATE INDEX IF NOT EXISTS idx_{table}_name_lc ON {table} (name_lc);"
    ))
    .map_err(|e| format!("indexing {table}: {e}"))?;

    let count: u64 = conn
        .query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
        .map_err(|e| format!("counting {table}: {e}"))?;
    Ok(count)
}

/// Rebuilds the alias / ISRC / artist-credit rows derived from one entity's
/// freshly imported table.
fn refresh_side_tables(conn: &Connection, entity: &EntitySpec) -> duckdb::Result<()> {
    let table = entity.table;
    let path = entity.path;

    conn.execute_batch(&format!(
        "DELETE FROM mb_alias WHERE entity = '{path}';
         INSERT INTO mb_alias
         SELECT '{path}', id, lower(a)
         FROM (SELECT id, unnest(json_extract_string(data, '$.aliases[*].name')) AS a
               FROM {table})
         WHERE a IS NOT NULL AND a <> '';"
    ))?;

    if entity.path == "recording" {
        conn.execute_batch(&format!(
            "DELETE FROM mb_recording_isrc;
             INSERT INTO mb_recording_isrc
             SELECT upper(i), id
             FROM (SELECT id, unnest(json_extract_string(data, '$.isrcs[*]')) AS i
                   FROM {table})
             WHERE i IS NOT NULL AND i <> '';
             CREATE INDEX IF NOT EXISTS idx_mb_recording_isrc ON mb_recording_isrc (isrc);"
        ))?;
    }

    // artist-credit joins power both `artist:"name"` search clauses and
    // `?artist=<mbid>` browses over recordings and release groups.
    if matches!(entity.path, "recording" | "release-group") {
        conn.execute_batch(&format!(
            "DELETE FROM mb_artist_credit WHERE entity = '{path}';
             INSERT INTO mb_artist_credit
             SELECT '{path}', id, artist_id, lower(coalesce(credit_name, ''))
             FROM (SELECT id,
                          unnest(json_extract_string(data, '$.\"artist-credit\"[*].artist.id')) AS artist_id,
                          unnest(json_extract_string(data, '$.\"artist-credit\"[*].name')) AS credit_name
                   FROM {table})
             WHERE artist_id IS NOT NULL;
             CREATE INDEX IF NOT EXISTS idx_mb_artist_credit_entity
                 ON mb_artist_credit (entity, entity_id);
             CREATE INDEX IF NOT EXISTS idx_mb_artist_credit_artist
                 ON mb_artist_credit (entity, artist_id);"
        ))?;
    }

    Ok(())
}

/// Imports every entity whose dump file exists under `dumps_dir`. Returns
/// `(entity path, row count)` per imported entity, in import order.
pub fn import_all(
    conn: &Connection,
    dumps_dir: &Path,
    only: Option<&[String]>,
    max_object_size: u64,
) -> Result<Vec<(&'static str, u64)>, String> {
    create_shared_tables(conn).map_err(|e| format!("creating shared tables: {e}"))?;

    let mut report = Vec::new();
    for entity in ENTITIES {
        if let Some(only) = only {
            if !only.iter().any(|o| o == entity.path) {
                continue;
            }
        }
        let Some(file) = dump_file(dumps_dir, entity) else {
            continue;
        };
        let count = import_entity(conn, entity, &file, max_object_size)?;
        report.push((entity.path, count));
    }
    if report.is_empty() {
        return Err(format!(
            "no dump files found under {} (expected <entity>/mbdump/<entity> or <entity>.jsonl)",
            dumps_dir.display()
        ));
    }
    Ok(report)
}
