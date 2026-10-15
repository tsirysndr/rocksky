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

/// DuckDB's ART index scans need single-column indexes; the existing compound
/// indexes on (entity, name/id) do not accelerate these probes. Safe to run
/// independently on an existing imported database while the server is stopped.
pub fn create_search_indexes(conn: &Connection) -> duckdb::Result<()> {
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_mb_alias_name_lc ON mb_alias (name_lc);
         CREATE INDEX IF NOT EXISTS idx_mb_credit_entity_id ON mb_artist_credit (entity_id);",
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
    create_search_indexes(conn).map_err(|e| format!("search indexes: {e}"))?;

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

/// Album recordings live inside release.media[].tracks[].recording in the
/// official JSON dumps; the standalone recording dump is not a full catalog.
/// Run offline on a staging copy: this replaces the release snapshot and merges
/// its recording documents, retaining standalone recordings already imported.
pub fn import_release_recordings(
    conn: &Connection,
    file: &Path,
    max_object_size: u64,
) -> Result<u64, String> {
    conn.execute_batch("BEGIN TRANSACTION")
        .map_err(|e| e.to_string())?;
    let result = (|| {
        create_shared_tables(conn).map_err(|e| e.to_string())?;
        import_entity(conn, &crate::mb::RELEASE, file, max_object_size)?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS mb_recording (
                id VARCHAR, name VARCHAR, name_lc VARCHAR, sort_name VARCHAR,
                disambiguation VARCHAR, type VARCHAR, data VARCHAR
            );
            CREATE TEMP TABLE release_recordings AS
            SELECT r.id AS release_id,
                   json_extract_string(t.value, '$.recording.id') AS id,
                   CAST(json_extract(t.value, '$.recording') AS VARCHAR) AS data
            FROM mb_release r, json_each(r.data, '$.media') m,
                 json_each(m.value, '$.tracks') t
            WHERE json_extract_string(t.value, '$.recording.id') IS NOT NULL;
            CREATE OR REPLACE TABLE mb_recording_release AS
            SELECT DISTINCT id AS recording_id, release_id FROM release_recordings;
            CREATE INDEX idx_mb_recording_release_id ON mb_recording_release(recording_id);
            CREATE TEMP TABLE expanded_recordings AS
            SELECT id, arg_min(data, release_id) AS data FROM release_recordings GROUP BY id;
            CREATE OR REPLACE TABLE mb_recording AS
            SELECT old.* FROM mb_recording old
            WHERE NOT EXISTS (SELECT 1 FROM expanded_recordings new WHERE new.id=old.id)
            UNION ALL
            SELECT id, json_extract_string(data, '$.title'),
                lower(json_extract_string(data, '$.title')), NULL::VARCHAR,
                json_extract_string(data, '$.disambiguation'),
                json_extract_string(data, '$.type'), data FROM expanded_recordings;
            DROP TABLE expanded_recordings;
            DROP TABLE release_recordings;
            CREATE INDEX idx_mb_recording_id ON mb_recording(id);
            CREATE INDEX idx_mb_recording_name_lc ON mb_recording(name_lc);
        "#,
        )
        .map_err(|e| format!("expanding release recordings: {e}"))?;
        refresh_side_tables(conn, crate::mb::entity("recording").unwrap())
            .map_err(|e| format!("recording side tables: {e}"))?;
        create_search_indexes(conn).map_err(|e| e.to_string())?;
        conn.query_row("SELECT count(*) FROM mb_recording", [], |r| {
            r.get::<_, u64>(0)
        })
        .map_err(|e| e.to_string())
    })();
    match result {
        Ok(count) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            Ok(count)
        }
        Err(err) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(err)
        }
    }
}
