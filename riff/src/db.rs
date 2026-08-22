use crate::error::{ApiError, ApiResult};
use duckdb::DuckdbConnectionManager;
use std::path::{Path, PathBuf};

/// DuckDB reads concurrently, and riff is built to use that: connections onto
/// one database run in parallel under MVCC, and an individual scan is itself
/// multi-threaded across cores.
///
/// The pool exists because of a *Rust binding* constraint rather than an engine
/// one: `duckdb::Connection` is `Send` but not `Sync` — it owns a `RefCell` over
/// its internal state — so one handle cannot be driven by two threads at once.
/// `DuckdbConnectionManager::connect` calls `Connection::try_clone`, which opens
/// a **new connection onto the same database instance**, so each in-flight
/// request gets its own handle and DuckDB executes them in parallel. Catalog
/// views created once at startup are visible to every connection because they
/// all share that one database.
///
/// These calls block, so every handler runs its query inside `web::block`; a
/// long scan then occupies a blocking thread rather than parking an actix
/// worker. See `routes::blocking`.
pub type Pool = r2d2::Pool<DuckdbConnectionManager>;
pub type PooledConn = r2d2::PooledConnection<DuckdbConnectionManager>;

pub struct Catalog {
    pool: Pool,
}

impl Catalog {
    pub fn get(&self) -> ApiResult<PooledConn> {
        Ok(self.pool.get()?)
    }
}

/// One parquet-backed relation.
///
/// `projection` is spelled out rather than `SELECT *` on purpose: if a column
/// is renamed or dropped upstream, riff fails at startup with the offending
/// table named, instead of returning half-empty JSON at request time.
struct TableSpec {
    name: &'static str,
    projection: &'static str,
    /// Columns riff can do without, as `(column, substitute expression)`. If the
    /// file does not have one, the substitute is selected under that name rather
    /// than failing the whole table.
    ///
    /// This is for columns that only refine a result — an ordering hint, say —
    /// never for one carrying data. A missing *required* column still fails at
    /// startup, loudly.
    optional_columns: &'static [(&'static str, &'static str)],
    /// Extra arguments for `read_parquet`, e.g. `, file_row_number=true`.
    read_options: &'static str,
    /// Column list (with casts) for the stand-in view used when an optional
    /// file is absent, so downstream SQL still plans and simply matches nothing.
    empty: &'static str,
    required: bool,
}

impl TableSpec {
    /// The projection to use against a file that actually has `present`
    /// columns, substituting for any absent optional ones.
    fn projection(&self, present: &[String]) -> String {
        if self.optional_columns.is_empty() {
            return self.projection.to_string();
        }
        self.projection
            .split(',')
            .map(|token| {
                let token = token.trim();
                match self
                    .optional_columns
                    .iter()
                    .find(|(name, _)| *name == token)
                {
                    Some((name, substitute)) if !has_column(present, name) => {
                        format!("{substitute} AS {name}")
                    }
                    _ => token.to_string(),
                }
            })
            .collect::<Vec<_>>()
            .join(", ")
    }

    fn missing_optional(&self, present: &[String]) -> Vec<&'static str> {
        self.optional_columns
            .iter()
            .map(|(name, _)| *name)
            .filter(|name| !has_column(present, name))
            .collect()
    }
}

fn has_column(present: &[String], name: &str) -> bool {
    present.iter().any(|c| c.eq_ignore_ascii_case(name))
}

/// The column names a parquet file actually carries.
fn parquet_columns(conn: &PooledConn, file: &Path) -> Result<Vec<String>, String> {
    let sql = format!(
        "SELECT column_name FROM (DESCRIBE SELECT * FROM read_parquet({}))",
        quote(file)
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("could not read {}: {e}", file.display()))?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| format!("could not read {}: {e}", file.display()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("could not read {}: {e}", file.display()))
}

const TABLES: &[TableSpec] = &[
    TableSpec {
        name: "artists",
        projection: "rowid AS row_id, id, fetched_at, name, followers_total, popularity",
        empty: "NULL::BIGINT AS row_id, NULL::VARCHAR AS id, NULL::BIGINT AS fetched_at, \
                NULL::VARCHAR AS name, NULL::BIGINT AS followers_total, NULL::BIGINT AS popularity",
        optional_columns: &[],
        read_options: "",
        required: true,
    },
    TableSpec {
        name: "albums",
        projection: "rowid AS row_id, id, fetched_at, name, album_type, available_markets_rowid, \
                     external_id_upc, copyright_c, copyright_p, label, popularity, release_date, \
                     release_date_precision, total_tracks, external_id_amgid",
        empty: "NULL::BIGINT AS row_id, NULL::VARCHAR AS id, NULL::BIGINT AS fetched_at, \
                NULL::VARCHAR AS name, NULL::VARCHAR AS album_type, NULL::BIGINT AS available_markets_rowid, \
                NULL::VARCHAR AS external_id_upc, NULL::VARCHAR AS copyright_c, NULL::VARCHAR AS copyright_p, \
                NULL::VARCHAR AS label, NULL::BIGINT AS popularity, NULL::VARCHAR AS release_date, \
                NULL::VARCHAR AS release_date_precision, NULL::BIGINT AS total_tracks, \
                NULL::VARCHAR AS external_id_amgid",
        optional_columns: &[],
        read_options: "",
        required: true,
    },
    TableSpec {
        name: "tracks",
        projection: "rowid AS row_id, id, fetched_at, name, preview_url, album_rowid, track_number, \
                     external_id_isrc, popularity, available_markets_rowid, disc_number, duration_ms, explicit",
        empty: "NULL::BIGINT AS row_id, NULL::VARCHAR AS id, NULL::BIGINT AS fetched_at, \
                NULL::VARCHAR AS name, NULL::VARCHAR AS preview_url, NULL::BIGINT AS album_rowid, \
                NULL::BIGINT AS track_number, NULL::VARCHAR AS external_id_isrc, NULL::BIGINT AS popularity, \
                NULL::BIGINT AS available_markets_rowid, NULL::BIGINT AS disc_number, \
                NULL::BIGINT AS duration_ms, NULL::BIGINT AS explicit",
        optional_columns: &[],
        read_options: "",
        required: true,
    },
    TableSpec {
        name: "artist_albums",
        projection: "artist_rowid, album_rowid, is_appears_on, is_implicit_appears_on, index_in_album",
        empty: "NULL::BIGINT AS artist_rowid, NULL::BIGINT AS album_rowid, NULL::BIGINT AS is_appears_on, \
                NULL::BIGINT AS is_implicit_appears_on, NULL::BIGINT AS index_in_album",
        optional_columns: &[],
        read_options: "",
        required: true,
    },
    TableSpec {
        name: "artist_images",
        projection: "artist_rowid, width, height, url",
        empty: "NULL::BIGINT AS artist_rowid, NULL::BIGINT AS width, NULL::BIGINT AS height, NULL::VARCHAR AS url",
        optional_columns: &[],
        read_options: "",
        required: false,
    },
    TableSpec {
        name: "artist_genres",
        projection: "artist_rowid, genre",
        empty: "NULL::BIGINT AS artist_rowid, NULL::VARCHAR AS genre",
        optional_columns: &[],
        read_options: "",
        required: false,
    },
    TableSpec {
        name: "album_images",
        projection: "album_rowid, width, height, url",
        empty: "NULL::BIGINT AS album_rowid, NULL::BIGINT AS width, NULL::BIGINT AS height, NULL::VARCHAR AS url",
        optional_columns: &[],
        read_options: "",
        required: false,
    },
    // Every column here is VARCHAR in the source parquet, including the numeric
    // ones. Casting is done at read time in `catalog::audio_features` with
    // TRY_CAST so one unparseable cell yields a null field instead of a 500.
    TableSpec {
        name: "track_audio_features",
        projection: "rowid AS row_id, track_id, fetched_at, null_response, duration_ms, time_signature, \
                     tempo, \"key\", \"mode\", danceability, energy, loudness, speechiness, acousticness, \
                     instrumentalness, liveness, valence",
        empty: "NULL::VARCHAR AS row_id, NULL::VARCHAR AS track_id, NULL::VARCHAR AS fetched_at, \
                NULL::VARCHAR AS null_response, NULL::VARCHAR AS duration_ms, NULL::VARCHAR AS time_signature, \
                NULL::VARCHAR AS tempo, NULL::VARCHAR AS \"key\", NULL::VARCHAR AS \"mode\", \
                NULL::VARCHAR AS danceability, NULL::VARCHAR AS energy, NULL::VARCHAR AS loudness, \
                NULL::VARCHAR AS speechiness, NULL::VARCHAR AS acousticness, NULL::VARCHAR AS instrumentalness, \
                NULL::VARCHAR AS liveness, NULL::VARCHAR AS valence",
        optional_columns: &[],
        read_options: "",
        required: false,
    },
    // Present in the production dump, so this is the normal path; the derived
    // view below only covers a partial dump. See `TRACK_ARTISTS_FALLBACK`.
    TableSpec {
        name: "track_artists_file",
        projection: "track_rowid, artist_rowid, index_in_track",
        // The production file is (track_rowid, artist_rowid) with no ordering
        // column. Order still matters — callers read `track.artists[0]` as the
        // primary artist — so fall back to the file's own row order, which is
        // the order the credits were written in. `file_row_number` makes that
        // explicit instead of relying on scan order, which SQL does not promise.
        optional_columns: &[("index_in_track", "file_row_number")],
        read_options: ", file_row_number=true",
        empty: "NULL::BIGINT AS track_rowid, NULL::BIGINT AS artist_rowid, NULL::BIGINT AS index_in_track",
        required: false,
    },
    // Referenced by `albums.available_markets_rowid` and
    // `tracks.available_markets_rowid`. Stored once per distinct market set, so a
    // batch of 50 tracks usually costs one lookup of a handful of rows.
    //
    // `markets` is expected to be a comma-separated list of ISO-3166-1 alpha-2
    // codes. This projection is what pins that down: a differently shaped file
    // fails at startup naming the file, instead of quietly serving `[]`.
    // Kept optional so a partial dump still starts.
    TableSpec {
        name: "available_markets",
        projection: "rowid AS row_id, markets",
        empty: "NULL::BIGINT AS row_id, NULL::VARCHAR AS markets",
        optional_columns: &[],
        read_options: "",
        required: false,
    },
];

/// Used only when `track_artists.parquet` is absent — production ships it, so
/// this is a safety net for a partial dump rather than the normal path.
///
/// A track then inherits its album's non-`appears_on` artists, which is the
/// correct primary artist in the vast majority of cases. What it cannot
/// represent is a per-track featured artist, which goes missing from
/// `track.artists[]`.
const TRACK_ARTISTS_FALLBACK: &str = "
    SELECT t.row_id AS track_rowid, aa.artist_rowid, aa.index_in_album AS index_in_track
    FROM tracks t
    JOIN artist_albums aa ON aa.album_rowid = t.album_rowid
    WHERE COALESCE(aa.is_appears_on, 0) = 0
";

pub struct Settings {
    pub data_dir: PathBuf,
    pub db_path: Option<PathBuf>,
    pub pool_size: u32,
}

fn quote(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "''"))
}

/// Opens the database and registers one view per relation. Returns the pool
/// plus a human-readable report of what was found, for the startup log.
pub fn open(cfg: &Settings) -> Result<(Catalog, Vec<String>), String> {
    let manager = match &cfg.db_path {
        // A persistent file lets an operator materialize + index the hot
        // relations once (see README) instead of rescanning parquet per query.
        Some(p) => DuckdbConnectionManager::file(p),
        None => DuckdbConnectionManager::memory(),
    }
    .map_err(err)?;

    let pool = r2d2::Pool::builder()
        .max_size(cfg.pool_size)
        .build(manager)
        .map_err(|e| format!("could not build the DuckDB pool: {e}"))?;

    let conn = pool
        .get()
        .map_err(|e| format!("could not open a DuckDB connection: {e}"))?;

    let mut report = Vec::new();
    let mut has_track_artists_file = false;

    for spec in TABLES {
        let file = cfg.data_dir.join(format!("{}.parquet", spec.name));
        // `track_artists_file` is the view name, not the file name.
        let file = if spec.name == "track_artists_file" {
            cfg.data_dir.join("track_artists.parquet")
        } else {
            file
        };

        if file.exists() {
            let present = parquet_columns(&conn, &file)?;
            let projection = spec.projection(&present);

            // A view is created even when the relation is materialized into the
            // persistent database, so `CREATE OR REPLACE` keeps restarts idempotent.
            let sql = format!(
                "CREATE OR REPLACE VIEW {} AS SELECT {} FROM read_parquet({}{})",
                spec.name,
                projection,
                quote(&file),
                spec.read_options
            );
            conn.execute_batch(&sql).map_err(|e| {
                // Report what the file actually has. Without this, a drift is a
                // guessing game: DuckDB names the one column it could not bind
                // and nothing else.
                format!(
                    "{} does not match the expected schema.\n  expected: {}\n  found:    {}\n{e}",
                    file.display(),
                    projection,
                    present.join(", ")
                )
            })?;

            let missing = spec.missing_optional(&present);
            if !missing.is_empty() {
                report.push(format!(
                    "  {:<22} {} (without {})",
                    spec.name,
                    file.display(),
                    missing.join(", ")
                ));
            } else {
                report.push(format!("  {:<22} {}", spec.name, file.display()));
            }

            if spec.name == "track_artists_file" {
                has_track_artists_file = true;
            }
        } else if spec.required {
            return Err(format!(
                "required parquet file is missing: {}\nset RIFF_DATA_DIR, or run `cargo run --bin riff-fixtures` to write the test fixtures",
                file.display()
            ));
        } else {
            conn.execute_batch(&format!(
                "CREATE OR REPLACE VIEW {} AS SELECT {} WHERE false",
                spec.name, spec.empty
            ))
            .map_err(err)?;
            report.push(format!("  {:<22} (absent — serving empty)", spec.name));
        }
    }

    let track_artists = if has_track_artists_file {
        "SELECT track_rowid, artist_rowid, index_in_track FROM track_artists_file".to_string()
    } else {
        report.push(
            "  track_artists          derived from artist_albums (no track_artists.parquet)".into(),
        );
        TRACK_ARTISTS_FALLBACK.to_string()
    };
    conn.execute_batch(&format!(
        "CREATE OR REPLACE VIEW track_artists AS {track_artists}"
    ))
    .map_err(err)?;

    drop(conn);
    Ok((Catalog { pool }, report))
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

impl From<String> for ApiError {
    fn from(e: String) -> Self {
        ApiError::Internal(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cols(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    fn track_artists_spec() -> &'static TableSpec {
        TABLES
            .iter()
            .find(|t| t.name == "track_artists_file")
            .expect("track_artists_file spec")
    }

    #[test]
    fn projection_is_untouched_when_every_column_is_present() {
        let spec = track_artists_spec();
        let present = cols(&["track_rowid", "artist_rowid", "index_in_track"]);
        assert_eq!(
            spec.projection(&present),
            "track_rowid, artist_rowid, index_in_track"
        );
        assert!(spec.missing_optional(&present).is_empty());
    }

    /// Production's track_artists.parquet is (track_rowid, artist_rowid) only.
    /// The ordering column has to be substituted rather than fail the table.
    #[test]
    fn absent_optional_column_is_substituted() {
        let spec = track_artists_spec();
        let present = cols(&["track_rowid", "artist_rowid"]);
        assert_eq!(
            spec.projection(&present),
            "track_rowid, artist_rowid, file_row_number AS index_in_track"
        );
        assert_eq!(spec.missing_optional(&present), vec!["index_in_track"]);
    }

    #[test]
    fn column_matching_ignores_case() {
        let spec = track_artists_spec();
        let present = cols(&["TRACK_ROWID", "ARTIST_ROWID", "Index_In_Track"]);
        assert!(spec.missing_optional(&present).is_empty());
    }

    /// A required column has no substitute: dropping one upstream must fail at
    /// startup, not silently serve nulls.
    #[test]
    fn required_columns_are_never_substituted() {
        for spec in TABLES {
            for (name, _) in spec.optional_columns {
                assert!(
                    spec.projection.contains(name),
                    "{}: optional column {name} is not in the projection",
                    spec.name
                );
            }
        }
        let artists = TABLES.iter().find(|t| t.name == "artists").unwrap();
        assert!(artists.optional_columns.is_empty());
        assert_eq!(
            artists.projection(&cols(&[])),
            artists.projection,
            "a spec with no optional columns must project verbatim"
        );
    }
}
