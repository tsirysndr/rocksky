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
fn parquet_columns(conn: &duckdb::Connection, file: &Path) -> Result<Vec<String>, String> {
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
        // Upstream calls the column `available_markets`, same as the table;
        // riff projects it as `markets` so the view is not `available_markets.available_markets`.
        projection: "rowid AS row_id, available_markets AS markets",
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
    /// How long a request may wait for a pooled connection before failing.
    ///
    /// Kept short on purpose. When every connection is busy, riff is overloaded
    /// and the right answer is an immediate 500 the proxy turns into a Spotify
    /// fallback — not 30 seconds of queueing that turns one slow query into a
    /// wall of timeouts (which is exactly how the first production deploy
    /// died).
    pub pool_timeout: std::time::Duration,
}

/// The derived lookup relations that make point queries cheap.
///
/// The big parquet files are sorted by `rowid` (verified against the production
/// footers), so hydration by row id already prunes to a couple of row groups.
/// What the dump has *no* order for is everything else riff looks things up by:
/// Spotify id, lowercased name, ISRC, artist-side foreign keys. Each entry here
/// is that relation, expressed once — in parquet mode it is registered as a view
/// (a scan, fine for fixtures), and `materialize` turns the same SELECT into a
/// table sorted by `order_by` so zone maps make it an index-grade lookup.
///
/// `track_audio_features`, `album_images` and `artist_genres` reappear here
/// because their parquet files are not sorted by their lookup key; the
/// materialized copies shadow the base views of the same name.
struct LookupSpec {
    name: &'static str,
    select: &'static str,
    order_by: &'static str,
    /// A sorted replacement for a base relation of the same name. In parquet
    /// mode the base view *is* the relation and no lookup view is created —
    /// a view selecting from itself would recurse; the entry only matters to
    /// the materializer, which swaps a sorted table in under the name.
    shadows_base: bool,
}

const LOOKUPS: &[LookupSpec] = &[
    LookupSpec {
        name: "track_ids",
        select: "SELECT id, row_id FROM tracks",
        order_by: "id",
        shadows_base: false,
    },
    LookupSpec {
        name: "artist_ids",
        select: "SELECT id, row_id FROM artists",
        order_by: "id",
        shadows_base: false,
    },
    LookupSpec {
        name: "album_ids",
        select: "SELECT id, row_id FROM albums",
        order_by: "id",
        shadows_base: false,
    },
    // popularity rides along so search can rank without touching the 23G
    // tracks relation at all.
    LookupSpec {
        name: "track_names",
        select: "SELECT lower(name) AS name_key, row_id, popularity FROM tracks",
        order_by: "name_key",
        shadows_base: false,
    },
    LookupSpec {
        name: "artist_names",
        select: "SELECT lower(name) AS name_key, row_id, popularity FROM artists",
        order_by: "name_key",
        shadows_base: false,
    },
    LookupSpec {
        name: "album_names",
        select: "SELECT lower(name) AS name_key, row_id, popularity FROM albums",
        order_by: "name_key",
        shadows_base: false,
    },
    LookupSpec {
        name: "track_isrcs",
        select: "SELECT upper(external_id_isrc) AS isrc_key, row_id FROM tracks \
                 WHERE external_id_isrc IS NOT NULL",
        order_by: "isrc_key",
        shadows_base: false,
    },
    // track_artists.parquet is sorted by track_rowid, which serves per-track
    // credits; top-tracks needs the artist-side order, with popularity along so
    // ranking never touches the tracks relation.
    LookupSpec {
        name: "track_artists_by_artist",
        select: "SELECT ta.artist_rowid, ta.track_rowid, t.popularity \
                 FROM track_artists ta JOIN tracks t ON t.row_id = ta.track_rowid",
        order_by: "artist_rowid",
        shadows_base: false,
    },
    // /artists/{id}/albums filters on album_type and orders by release_date;
    // carrying both here means the listing never joins the albums relation.
    LookupSpec {
        name: "artist_albums_expanded",
        select: "SELECT aa.artist_rowid, aa.album_rowid, aa.is_appears_on, \
                        aa.is_implicit_appears_on, aa.index_in_album, \
                        al.album_type, al.release_date \
                 FROM artist_albums aa JOIN albums al ON al.row_id = aa.album_rowid",
        order_by: "artist_rowid",
        shadows_base: false,
    },
    LookupSpec {
        name: "artist_albums_by_album",
        select: "SELECT artist_rowid, album_rowid, is_appears_on, \
                        is_implicit_appears_on, index_in_album FROM artist_albums",
        order_by: "album_rowid, COALESCE(index_in_album, 0)",
        shadows_base: false,
    },
    LookupSpec {
        name: "album_images",
        select: "SELECT album_rowid, width, height, url FROM album_images",
        order_by: "album_rowid, COALESCE(width, 0) DESC",
        shadows_base: true,
    },
    LookupSpec {
        name: "artist_genres",
        select: "SELECT artist_rowid, genre FROM artist_genres",
        order_by: "artist_rowid, genre",
        shadows_base: true,
    },
    LookupSpec {
        name: "track_audio_features",
        select: "SELECT * FROM track_audio_features",
        order_by: "track_id",
        shadows_base: true,
    },
];

/// Names of BASE TABLEs already present in the attached database. When a
/// materialized table exists under a relation's name, the view of the same name
/// must not be created over it — the table *is* the relation.
fn base_tables(conn: &duckdb::Connection) -> Result<std::collections::HashSet<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT table_name FROM information_schema.tables \
             WHERE table_type = 'BASE TABLE' AND table_schema = 'main'",
        )
        .map_err(err)?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

fn quote(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "''"))
}

/// Registers the parquet-backed relations on a connection: one view per file,
/// schema-checked, with the `track_artists` fallback when its file is absent.
/// Relation names already present as base tables (materialized) are left alone.
fn register_relations(
    conn: &duckdb::Connection,
    data_dir: &Path,
    tables: &std::collections::HashSet<String>,
) -> Result<Vec<String>, String> {
    let mut report = Vec::new();
    let mut has_track_artists_file = false;

    for spec in TABLES {
        if tables.contains(spec.name) {
            report.push(format!("  {:<24} (materialized table)", spec.name));
            continue;
        }

        let file = data_dir.join(format!("{}.parquet", spec.name));
        // `track_artists_file` is the view name, not the file name.
        let file = if spec.name == "track_artists_file" {
            data_dir.join("track_artists.parquet")
        } else {
            file
        };

        if file.exists() {
            let present = parquet_columns(conn, &file)?;
            let projection = spec.projection(&present);

            // `CREATE OR REPLACE` keeps restarts idempotent.
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
                    "  {:<24} {} (without {})",
                    spec.name,
                    file.display(),
                    missing.join(", ")
                ));
            } else {
                report.push(format!("  {:<24} {}", spec.name, file.display()));
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
            report.push(format!("  {:<24} (absent — serving empty)", spec.name));
        }
    }

    if !tables.contains("track_artists") {
        let track_artists = if has_track_artists_file {
            "SELECT track_rowid, artist_rowid, index_in_track FROM track_artists_file".to_string()
        } else {
            report.push(
                "  track_artists            derived from artist_albums (no track_artists.parquet)"
                    .into(),
            );
            TRACK_ARTISTS_FALLBACK.to_string()
        };
        conn.execute_batch(&format!(
            "CREATE OR REPLACE VIEW track_artists AS {track_artists}"
        ))
        .map_err(err)?;
    }

    // The lookup relations, as views. Anything the materializer has already
    // turned into a sorted table keeps the table.
    for lookup in LOOKUPS {
        if tables.contains(lookup.name) || lookup.shadows_base {
            continue;
        }
        conn.execute_batch(&format!(
            "CREATE OR REPLACE VIEW {} AS {}",
            lookup.name, lookup.select
        ))
        .map_err(|e| format!("could not register lookup view {}: {e}", lookup.name))?;
    }

    Ok(report)
}

/// Opens the database and registers every relation. Returns the pool plus a
/// human-readable report of what was found, for the startup log.
pub fn open(cfg: &Settings) -> Result<(Catalog, Vec<String>), String> {
    let manager = match &cfg.db_path {
        // A persistent file carries the sorted lookup tables written by
        // `riff-materialize`; without them every search and id lookup is a full
        // scan of the parquet, which cannot be served interactively at the
        // production sizes (23G tracks, 14G audio features).
        Some(p) => DuckdbConnectionManager::file(p),
        None => DuckdbConnectionManager::memory(),
    }
    .map_err(err)?;

    let pool = r2d2::Pool::builder()
        .max_size(cfg.pool_size)
        .connection_timeout(cfg.pool_timeout)
        .build(manager)
        .map_err(|e| format!("could not build the DuckDB pool: {e}"))?;

    let conn = pool
        .get()
        .map_err(|e| format!("could not open a DuckDB connection: {e}"))?;

    // Bound the buffer pool well below the machine. DuckDB defaults to 80% of
    // RAM, which on the 15G production host meant riff grew to 12G RSS, starved
    // the OS page cache of the 90G parquet+db working set — making every query
    // disk-bound and slow — and was then OOM-killed. Serving is point lookups;
    // it needs a small pool and a large page cache, not the reverse.
    let memory_limit = std::env::var("RIFF_MEMORY_LIMIT").unwrap_or_else(|_| "2GB".to_string());
    conn.execute_batch(&format!(
        "SET memory_limit = '{}'",
        memory_limit.replace('\'', "")
    ))
    .map_err(|e| format!("could not apply RIFF_MEMORY_LIMIT={memory_limit}: {e}"))?;

    let tables = base_tables(&conn)?;
    let mut report = register_relations(&conn, &cfg.data_dir, &tables)?;
    if tables.contains("riff_meta") {
        report.push(format!(
            "  ({} lookup tables materialized in {})",
            LOOKUPS.iter().filter(|l| tables.contains(l.name)).count(),
            cfg.db_path
                .as_deref()
                .map(|p| p.display().to_string())
                .unwrap_or_default()
        ));
    } else {
        report.push(
            "  (no materialized lookups — searches and id lookups scan the parquet; \
run riff-materialize for production data)"
                .into(),
        );
    }

    drop(conn);
    Ok((Catalog { pool }, report))
}

/// Builds the sorted lookup tables into `db_path`. One-off, rerunnable; each
/// table is built under a scratch name and swapped in, so a crash mid-build
/// never leaves a half-written relation behind.
///
/// `progress` receives one line per step, for the CLI to print as it goes —
/// the big tables take minutes each and silence reads as a hang.
pub fn materialize(
    data_dir: &Path,
    db_path: &Path,
    mut progress: impl FnMut(&str),
) -> Result<(), String> {
    let conn = duckdb::Connection::open(db_path)
        .map_err(|e| format!("could not open {}: {e}", db_path.display()))?;

    // Spill next to the database, on the same volume — the external sorts over
    // the 23G/14G relations need real scratch space, and /tmp may be small.
    let tmp = db_path.with_extension("duckdb.tmp");
    let memory_limit = std::env::var("RIFF_MEMORY_LIMIT").unwrap_or_else(|_| "8GB".to_string());
    conn.execute_batch(&format!(
        "SET temp_directory = {}; SET memory_limit = '{}'; SET preserve_insertion_order = true;",
        quote(&tmp),
        memory_limit.replace('\'', "")
    ))
    .map_err(err)?;

    let tables = base_tables(&conn)?;
    for line in register_relations(&conn, data_dir, &tables)? {
        progress(&line);
    }

    // A staging pass so the 23G tracks relation is decoded once, not once per
    // derived table.
    let steps: &[(&str, String)] = &[(
        "stage_tracks",
        "SELECT row_id, id, lower(name) AS name_key, popularity, \
                    upper(external_id_isrc) AS isrc_key \
             FROM tracks"
            .to_string(),
    )];
    for (name, select) in steps {
        run_ctas(&conn, name, select, None, &mut progress)?;
    }

    for lookup in LOOKUPS {
        // stage-aware sources: the three track maps read the staging table
        // instead of going back to the parquet.
        let select = match lookup.name {
            "track_ids" => "SELECT id, row_id FROM stage_tracks".to_string(),
            "track_names" => "SELECT name_key, row_id, popularity FROM stage_tracks".to_string(),
            "track_isrcs" => {
                "SELECT isrc_key, row_id FROM stage_tracks WHERE isrc_key IS NOT NULL".to_string()
            }
            "track_artists_by_artist" => "SELECT ta.artist_rowid, ta.track_rowid, t.popularity \
                 FROM track_artists ta JOIN stage_tracks t ON t.row_id = ta.track_rowid"
                .to_string(),
            _ => lookup.select.to_string(),
        };
        run_ctas(
            &conn,
            lookup.name,
            &select,
            Some(lookup.order_by),
            &mut progress,
        )?;
        if lookup.name == "track_artists_by_artist" {
            conn.execute_batch("DROP TABLE IF EXISTS stage_tracks")
                .map_err(err)?;
        }
    }

    conn.execute_batch(
        "DROP TABLE IF EXISTS riff_meta; \
         CREATE TABLE riff_meta AS SELECT 1 AS schema_version",
    )
    .map_err(err)?;
    let _ = std::fs::remove_dir_all(&tmp);
    progress("done — riff_meta written; point riff at this file with --db-path");
    Ok(())
}

/// `DROP`-safe create-and-swap of one sorted table.
fn run_ctas(
    conn: &duckdb::Connection,
    name: &str,
    select: &str,
    order_by: Option<&str>,
    progress: &mut impl FnMut(&str),
) -> Result<(), String> {
    let started = std::time::Instant::now();
    let order = order_by
        .map(|o| format!(" ORDER BY {o}"))
        .unwrap_or_default();
    // Build under a scratch name, then swap: the source of some tables is the
    // same-named parquet view, which cannot be dropped before it is read.
    conn.execute_batch(&format!(
        "DROP TABLE IF EXISTS {name}__new; \
         CREATE TABLE {name}__new AS {select}{order};"
    ))
    .map_err(|e| format!("materializing {name} failed: {e}"))?;
    // `DROP VIEW IF EXISTS` errors when the name is a table (and vice versa),
    // so look up what the name currently is — a view on the first run, the
    // previous table on a rebuild — and drop that.
    let existing: Option<String> = conn
        .query_row(
            "SELECT table_type FROM information_schema.tables \
             WHERE table_schema = 'main' AND table_name = ?",
            [name],
            |r| r.get(0),
        )
        .ok();
    let drop = match existing.as_deref() {
        Some("VIEW") => format!("DROP VIEW {name};"),
        Some(_) => format!("DROP TABLE {name};"),
        None => String::new(),
    };
    conn.execute_batch(&format!("{drop} ALTER TABLE {name}__new RENAME TO {name};"))
        .map_err(|e| format!("swapping {name} in failed: {e}"))?;

    let rows: i64 = conn
        .query_row(&format!("SELECT COUNT(*) FROM {name}"), [], |r| r.get(0))
        .map_err(err)?;
    progress(&format!(
        "  {:<24} {:>12} rows  {:>6.1}s",
        name,
        rows,
        started.elapsed().as_secs_f64()
    ));
    Ok(())
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
