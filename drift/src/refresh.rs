//! The whole recommender, run as one batch: pull live history from Postgres,
//! score every user in a single set-based DuckDB pass, and land the results in
//! the durable `recommendations` table of the serving database file.
//!
//! Nothing here runs at request time. The legacy TypeScript endpoint recomputed
//! neighbours and candidates per request with ~10 sequential Postgres queries;
//! drift computes all users together — the neighbour graph, taste vectors and
//! candidate scoring are joins over the full corpus, which DuckDB does in
//! seconds — and serving becomes an indexed lookup on the result table.
//!
//! Everything below runs on one pooled connection to the serving database.
//! Intermediates are ordinary tables (the Appender only reaches the main
//! schema, so TEMP staging is not an option) that are dropped before and after
//! each run; the final `CREATE OR REPLACE TABLE recommendations` is the swap —
//! MVCC keeps concurrent readers on the previous version until it commits — and
//! a CHECKPOINT afterwards keeps the file compact.

use crate::store::Store;
use crate::Config;
use duckdb::params;
use sqlx::{Connection, Row};
use std::path::Path;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// Every transient object a refresh creates, in reverse-dependency order.
/// Dropped before a run (a crashed refresh leaves leftovers) and after.
const STAGING_TABLES: &[&str] = &[
    "album_final",
    "album_fallback",
    "album_picks",
    "album_pool",
    "heard_albums",
    "artist_final",
    "artist_fallback",
    "artist_ser",
    "artist_picks",
    "artist_scored",
    "artist_cf",
    "artist_vec",
    "heard_artists",
    "final",
    "fallback",
    "ser",
    "picks",
    "scored",
    "user_top_genres",
    "taste",
    "track_vec",
    "genre_hits",
    "cf",
    "heard",
    "neighbours",
    "user_artists",
    "user_tracks",
    "artist_genres",
    "artists",
    "albums",
    "tracks",
    "loved",
    "scrobbles",
    "users",
];

pub enum RefreshOutcome {
    Completed {
        users: usize,
        rows: usize,
        took_ms: u128,
    },
    /// Nothing changed since the last run — no new plays, same day (the
    /// serendipity salt rotates daily), same config — so the standing snapshot
    /// is already what a rebuild would produce.
    Skipped,
}

pub fn refresh(
    cfg: &Config,
    db_url: &str,
    store: &Store,
    force: bool,
) -> Result<RefreshOutcome, String> {
    let t0 = Instant::now();
    let now_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs_f64();

    let conn = store.conn()?;

    // One cheap Postgres round trip decides whether the full rebuild is worth
    // it. Computed *before* the fetch on purpose: a scrobble landing between
    // fingerprint and fetch makes it into the snapshot anyway and simply
    // re-runs the next refresh — stale-skips are the failure mode to avoid,
    // and this ordering cannot produce one.
    let fingerprint = fetch_fingerprint(cfg, db_url, (now_epoch as i64) / 86400)?;
    if !force {
        let stored: Option<String> = conn
            .query_row("SELECT value FROM fingerprint", [], |r| r.get(0))
            .ok();
        if stored.as_deref() == Some(fingerprint.as_str()) {
            tracing::info!("refresh: nothing changed since the last run — skipping");
            return Ok(RefreshOutcome::Skipped);
        }
    }

    tracing::info!("refresh: starting");
    let data = fetch_postgres(db_url, cfg.history_days)?;

    // A hard ceiling on DuckDB memory: without it, a heavy join (the features
    // parquet is the full catalog dump) grows until the kernel OOM-kills the
    // whole service. Under the cap DuckDB spills to disk instead.
    conn.execute_batch(&format!(
        "SET memory_limit = '{}'; SET preserve_insertion_order = false;",
        cfg.memory_limit.replace('\'', "")
    ))
    .map_err(|e| format!("duckdb settings failed: {e}"))?;

    tracing::info!("refresh: resetting staging tables");
    drop_staging(&conn)?;
    create_staging(&conn)?;
    load_duckdb(&conn, &data)?;
    sync_features(&conn, &cfg.features_parquet)?;
    run_pipeline(&conn, cfg, now_epoch)?;

    // The swap: readers keep the old `recommendations` until this commits.
    // Sorted by (did, final_rank) so serving's `did = ?` is a zone-map-pruned
    // lookup, not a scan — which needs preserve_insertion_order back on, or
    // the ORDER BY is not guaranteed to survive into the table. `rec_users`
    // is the tiny handle → DID map serving resolves through, so the snapshot
    // query never carries the unprunable `OR handle = ?` disjunct.
    tracing::info!("refresh: persisting snapshot");
    conn.execute_batch(
        "SET preserve_insertion_order = true;
         CREATE OR REPLACE TABLE recommendations AS
         SELECT * FROM final ORDER BY did, final_rank;
         CREATE OR REPLACE TABLE artist_recommendations AS
         SELECT * FROM artist_final ORDER BY did, final_rank;
         CREATE OR REPLACE TABLE album_recommendations AS
         SELECT * FROM album_final ORDER BY did, final_rank;
         CREATE OR REPLACE TABLE rec_users AS SELECT did, handle FROM users;",
    )
    .map_err(|e| format!("persisting recommendations failed: {e}"))?;

    let (users, rows) = conn
        .query_row(
            "SELECT count(DISTINCT did), count(*) FROM recommendations",
            [],
            |r| Ok((r.get::<_, i64>(0)? as usize, r.get::<_, i64>(1)? as usize)),
        )
        .map_err(|e| format!("counting recommendations failed: {e}"))?;
    let (artist_rows, album_rows) = conn
        .query_row(
            "SELECT (SELECT count(*) FROM artist_recommendations),
                    (SELECT count(*) FROM album_recommendations)",
            [],
            |r| Ok((r.get::<_, i64>(0)? as usize, r.get::<_, i64>(1)? as usize)),
        )
        .map_err(|e| format!("counting artist/album recommendations failed: {e}"))?;

    let took_ms = t0.elapsed().as_millis();
    conn.execute_batch(&format!(
        "CREATE OR REPLACE TABLE meta AS
         SELECT {}::BIGINT AS refreshed_at_epoch, {}::BIGINT AS took_ms,
                {}::BIGINT AS users, {}::BIGINT AS rows_total;",
        now_epoch as i64, took_ms, users, rows
    ))
    .map_err(|e| format!("persisting meta failed: {e}"))?;

    // Written only after everything else committed: a crashed refresh leaves
    // the old fingerprint behind, so the next interval retries instead of
    // skipping over a half-done run.
    conn.execute_batch(&format!(
        "CREATE OR REPLACE TABLE fingerprint AS SELECT '{}' AS value;",
        fingerprint.replace('\'', "''")
    ))
    .map_err(|e| format!("persisting fingerprint failed: {e}"))?;

    tracing::info!("refresh: dropping staging + checkpoint");
    drop_staging(&conn)?;
    conn.execute_batch("CHECKPOINT;")
        .map_err(|e| format!("checkpoint failed: {e}"))?;

    tracing::info!(
        "refresh done: {users} users, {rows} track rows, {artist_rows} artist rows, {album_rows} album rows, {took_ms} ms"
    );
    Ok(RefreshOutcome::Completed {
        users,
        rows,
        took_ms,
    })
}

/// A cheap summary of everything a rebuild would read: row counts and the
/// newest scrobble (counts catch backfills and un-loves that `max` alone
/// would miss), the day number (the serendipity salt rotates daily), and the
/// scoring config (so a restart with new flags never skips into a snapshot
/// built with the old ones). Equal fingerprint ⇒ identical rebuild.
fn fetch_fingerprint(cfg: &Config, db_url: &str, day: i64) -> Result<String, String> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("tokio runtime failed: {e}"))?;

    rt.block_on(async {
        let t = Instant::now();
        let mut conn = pg_connect(db_url).await?;
        let row = sqlx::query(&format!(
            "SELECT (SELECT count(*) FROM scrobbles
                     WHERE user_id IS NOT NULL AND track_id IS NOT NULL{}),
                    (SELECT coalesce(extract(epoch FROM max(\"timestamp\")), 0)::float8 FROM scrobbles),
                    (SELECT count(*) FROM loved_tracks),
                    (SELECT count(*) FROM users),
                    (SELECT count(*) FROM tracks),
                    (SELECT count(*) FROM artists WHERE genres IS NOT NULL),
                    (SELECT count(*) FROM albums)",
            history_cutoff(cfg.history_days)
        ))
        .fetch_one(&mut conn)
        .await
        .map_err(|e| format!("fingerprint query failed: {e}"))?;

        let counts: Vec<String> = (0..7)
            .map(|i| {
                if i == 1 {
                    row.get::<f64, _>(i).to_string()
                } else {
                    row.get::<i64, _>(i).to_string()
                }
            })
            .collect();
        let fp = format!(
            "v2|{}|day={day}|cfg={},{},{},{},{},{},{},{}",
            counts.join("|"),
            cfg.decay_lambda,
            cfg.content_weight,
            cfg.neighbours,
            cfg.limit_per_user,
            cfg.serendipity_ratio,
            cfg.candidate_limit,
            cfg.profile_limit,
            cfg.history_days,
        );
        tracing::info!("postgres: fingerprint in {} ms", t.elapsed().as_millis());
        Ok(fp)
    })
}

/// SQL tail bounding scrobble reads to the configured window; empty when the
/// window is 0 (unlimited).
fn history_cutoff(history_days: u32) -> String {
    if history_days == 0 {
        String::new()
    } else {
        format!(" AND \"timestamp\" > now() - interval '1 day' * {history_days}")
    }
}

/// Everything drift needs from Postgres, fetched in one session.
struct PgData {
    scrobbles: Vec<(String, String, Option<String>, Option<String>, f64)>,
    loved: Vec<(String, String)>,
    users: Vec<(String, String, String, bool)>,
    #[allow(clippy::type_complexity)]
    tracks: Vec<(
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    )>,
    #[allow(clippy::type_complexity)]
    artists: Vec<(
        String,
        Option<String>,
        String,
        Option<String>,
        Option<Vec<String>>,
    )>,
    #[allow(clippy::type_complexity)]
    albums: Vec<(
        String,
        String,
        String,
        Option<i32>,
        Option<String>,
        Option<String>,
        Option<String>,
    )>,
}

/// sqlx is async (TLS is negotiated from sslmode in the URL); refresh always
/// runs on a plain thread — never the actix runtime — so a small
/// current-thread runtime here is safe. The five relations are fetched
/// concurrently on separate connections — over a WAN link the fetch phase
/// costs one round trip of the slowest relation, not the sum of all five.
fn fetch_postgres(db_url: &str, history_days: u32) -> Result<PgData, String> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("tokio runtime failed: {e}"))?;

    rt.block_on(async {
        let t = Instant::now();
        tracing::info!("postgres: fetching 6 relations concurrently");
        let (scrobbles, loved, users, tracks, artists, albums) = tokio::try_join!(
            fetch_scrobbles(db_url, history_days),
            fetch_loved(db_url),
            fetch_users(db_url),
            fetch_tracks(db_url),
            fetch_artists(db_url),
            fetch_albums(db_url),
        )?;
        tracing::info!(
            "postgres: all fetches done in {} ms",
            t.elapsed().as_millis()
        );
        Ok(PgData {
            scrobbles,
            loved,
            users,
            tracks,
            artists,
            albums,
        })
    })
}

async fn pg_connect(db_url: &str) -> Result<sqlx::postgres::PgConnection, String> {
    sqlx::postgres::PgConnection::connect(db_url)
        .await
        .map_err(|e| format!("postgres connect failed: {e}"))
}

/// With λ = 0.02/day, a play older than the default 548-day window carries
/// weight e^-11 ≈ 2e-5 — nothing any score can see — so the cutoff bounds
/// what will otherwise become an ever-growing full-history fetch every
/// refresh interval. The decayed global chart reads the same window, where
/// old plays vanish just as completely.
async fn fetch_scrobbles(
    db_url: &str,
    history_days: u32,
) -> Result<Vec<(String, String, Option<String>, Option<String>, f64)>, String> {
    let t = Instant::now();
    let mut conn = pg_connect(db_url).await?;
    let rows: Vec<(String, String, Option<String>, Option<String>, f64)> = sqlx::query(&format!(
        "SELECT user_id, track_id, artist_id, album_id, extract(epoch FROM \"timestamp\")::float8 AS ts
         FROM scrobbles WHERE user_id IS NOT NULL AND track_id IS NOT NULL{}",
        history_cutoff(history_days)
    ))
    .fetch_all(&mut conn)
    .await
    .map_err(|e| format!("scrobbles query failed: {e}"))?
    .into_iter()
    .map(|r| (r.get(0), r.get(1), r.get(2), r.get(3), r.get(4)))
    .collect();
    tracing::info!(
        "postgres: scrobbles — {} rows in {} ms",
        rows.len(),
        t.elapsed().as_millis()
    );
    Ok(rows)
}

async fn fetch_loved(db_url: &str) -> Result<Vec<(String, String)>, String> {
    let t = Instant::now();
    let mut conn = pg_connect(db_url).await?;
    let rows: Vec<(String, String)> = sqlx::query("SELECT user_id, track_id FROM loved_tracks")
        .fetch_all(&mut conn)
        .await
        .map_err(|e| format!("loved_tracks query failed: {e}"))?
        .into_iter()
        .map(|r| (r.get(0), r.get(1)))
        .collect();
    tracing::info!(
        "postgres: loved_tracks — {} rows in {} ms",
        rows.len(),
        t.elapsed().as_millis()
    );
    Ok(rows)
}

async fn fetch_users(db_url: &str) -> Result<Vec<(String, String, String, bool)>, String> {
    let t = Instant::now();
    let mut conn = pg_connect(db_url).await?;
    let rows: Vec<(String, String, String, bool)> =
        sqlx::query("SELECT xata_id, did, handle, is_bot FROM users")
            .fetch_all(&mut conn)
            .await
            .map_err(|e| format!("users query failed: {e}"))?
            .into_iter()
            .map(|r| (r.get(0), r.get(1), r.get(2), r.get(3)))
            .collect();
    tracing::info!(
        "postgres: users — {} rows in {} ms",
        rows.len(),
        t.elapsed().as_millis()
    );
    Ok(rows)
}

#[allow(clippy::type_complexity)]
async fn fetch_tracks(
    db_url: &str,
) -> Result<
    Vec<(
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    )>,
    String,
> {
    let t = Instant::now();
    let mut conn = pg_connect(db_url).await?;
    let rows: Vec<_> = sqlx::query(
        "SELECT xata_id, title, artist, album, album_art, uri, artist_uri, album_uri, spotify_link
         FROM tracks",
    )
    .fetch_all(&mut conn)
    .await
    .map_err(|e| format!("tracks query failed: {e}"))?
    .into_iter()
    .map(|r| {
        (
            r.get(0),
            r.get(1),
            r.get(2),
            r.get(3),
            r.get(4),
            r.get(5),
            r.get(6),
            r.get(7),
            r.get(8),
        )
    })
    .collect();
    tracing::info!(
        "postgres: tracks — {} rows in {} ms",
        rows.len(),
        t.elapsed().as_millis()
    );
    Ok(rows)
}

#[allow(clippy::type_complexity)]
async fn fetch_artists(
    db_url: &str,
) -> Result<
    Vec<(
        String,
        Option<String>,
        String,
        Option<String>,
        Option<Vec<String>>,
    )>,
    String,
> {
    let t = Instant::now();
    let mut conn = pg_connect(db_url).await?;
    let rows: Vec<_> = sqlx::query("SELECT xata_id, uri, name, picture, genres FROM artists")
        .fetch_all(&mut conn)
        .await
        .map_err(|e| format!("artists query failed: {e}"))?
        .into_iter()
        .map(|r| (r.get(0), r.get(1), r.get(2), r.get(3), r.get(4)))
        .collect();
    tracing::info!(
        "postgres: artists — {} rows in {} ms",
        rows.len(),
        t.elapsed().as_millis()
    );
    Ok(rows)
}

#[allow(clippy::type_complexity)]
async fn fetch_albums(
    db_url: &str,
) -> Result<
    Vec<(
        String,
        String,
        String,
        Option<i32>,
        Option<String>,
        Option<String>,
        Option<String>,
    )>,
    String,
> {
    let t = Instant::now();
    let mut conn = pg_connect(db_url).await?;
    let rows: Vec<_> =
        sqlx::query("SELECT xata_id, title, artist, year, album_art, uri, artist_uri FROM albums")
            .fetch_all(&mut conn)
            .await
            .map_err(|e| format!("albums query failed: {e}"))?
            .into_iter()
            .map(|r| {
                (
                    r.get(0),
                    r.get(1),
                    r.get(2),
                    r.get(3),
                    r.get(4),
                    r.get(5),
                    r.get(6),
                )
            })
            .collect();
    tracing::info!(
        "postgres: albums — {} rows in {} ms",
        rows.len(),
        t.elapsed().as_millis()
    );
    Ok(rows)
}

fn drop_staging(conn: &duckdb::Connection) -> Result<(), String> {
    let mut sql = String::from("DROP VIEW IF EXISTS features;");
    for t in STAGING_TABLES {
        sql.push_str(&format!("DROP TABLE IF EXISTS {t};"));
    }
    conn.execute_batch(&sql)
        .map_err(|e| format!("dropping staging tables failed: {e}"))
}

fn create_staging(conn: &duckdb::Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE users (id VARCHAR, did VARCHAR, handle VARCHAR, is_bot BOOLEAN);
         CREATE TABLE scrobbles (
             user_id VARCHAR, track_id VARCHAR, artist_id VARCHAR, album_id VARCHAR, ts DOUBLE);
         CREATE TABLE loved (user_id VARCHAR, track_id VARCHAR);
         CREATE TABLE tracks (
             id VARCHAR, title VARCHAR, artist VARCHAR, album VARCHAR, album_art VARCHAR,
             uri VARCHAR, artist_uri VARCHAR, album_uri VARCHAR,
             spotify_link VARCHAR, spotify_id VARCHAR);
         CREATE TABLE artists (id VARCHAR, uri VARCHAR, name VARCHAR, picture VARCHAR);
         CREATE TABLE albums (
             id VARCHAR, title VARCHAR, artist VARCHAR, year INTEGER,
             album_art VARCHAR, uri VARCHAR, artist_uri VARCHAR);
         CREATE TABLE artist_genres (artist_id VARCHAR, artist_uri VARCHAR, genre VARCHAR);",
    )
    .map_err(|e| format!("staging schema failed: {e}"))
}

/// Loads the fetched rows into the DuckDB staging tables through Appenders,
/// with a progress line every 100k rows so long loads are visible in the
/// journal.
fn load_duckdb(conn: &duckdb::Connection, data: &PgData) -> Result<(), String> {
    const TICK: usize = 100_000;
    let t_all = Instant::now();

    let t = Instant::now();
    tracing::info!("duckdb: loading {} scrobbles", data.scrobbles.len());
    let mut app = conn
        .appender("scrobbles")
        .map_err(|e| format!("appender failed: {e}"))?;
    for (i, (user_id, track_id, artist_id, album_id, ts)) in data.scrobbles.iter().enumerate() {
        app.append_row(params![
            user_id.as_str(),
            track_id.as_str(),
            artist_id.as_deref(),
            album_id.as_deref(),
            *ts
        ])
        .map_err(|e| format!("scrobbles append failed: {e}"))?;
        if (i + 1) % TICK == 0 {
            tracing::info!("duckdb: scrobbles {} / {}", i + 1, data.scrobbles.len());
        }
    }
    drop(app);
    tracing::info!("duckdb: scrobbles loaded in {} ms", t.elapsed().as_millis());

    let t = Instant::now();
    tracing::info!("duckdb: loading {} loved tracks", data.loved.len());
    let mut app = conn.appender("loved").map_err(|e| e.to_string())?;
    for (user_id, track_id) in &data.loved {
        app.append_row(params![user_id.as_str(), track_id.as_str()])
            .map_err(|e| format!("loved append failed: {e}"))?;
    }
    drop(app);
    tracing::info!("duckdb: loved loaded in {} ms", t.elapsed().as_millis());

    let t = Instant::now();
    tracing::info!("duckdb: loading {} users", data.users.len());
    let mut app = conn.appender("users").map_err(|e| e.to_string())?;
    for (id, did, handle, is_bot) in &data.users {
        app.append_row(params![id.as_str(), did.as_str(), handle.as_str(), *is_bot])
            .map_err(|e| format!("users append failed: {e}"))?;
    }
    drop(app);
    tracing::info!("duckdb: users loaded in {} ms", t.elapsed().as_millis());

    let t = Instant::now();
    tracing::info!("duckdb: loading {} tracks", data.tracks.len());
    let mut app = conn.appender("tracks").map_err(|e| e.to_string())?;
    for (i, (id, title, artist, album, album_art, uri, artist_uri, album_uri, spotify_link)) in
        data.tracks.iter().enumerate()
    {
        app.append_row(params![
            id.as_str(),
            title.as_deref(),
            artist.as_deref(),
            album.as_deref(),
            album_art.as_deref(),
            uri.as_deref(),
            artist_uri.as_deref(),
            album_uri.as_deref(),
            spotify_link.as_deref(),
            None::<&str>
        ])
        .map_err(|e| format!("tracks append failed: {e}"))?;
        if (i + 1) % TICK == 0 {
            tracing::info!("duckdb: tracks {} / {}", i + 1, data.tracks.len());
        }
    }
    drop(app);
    tracing::info!("duckdb: tracks loaded in {} ms", t.elapsed().as_millis());

    let t = Instant::now();
    tracing::info!("duckdb: loading {} artists", data.artists.len());
    let mut app = conn.appender("artists").map_err(|e| e.to_string())?;
    for (id, uri, name, picture, _) in &data.artists {
        app.append_row(params![
            id.as_str(),
            uri.as_deref(),
            name.as_str(),
            picture.as_deref()
        ])
        .map_err(|e| format!("artists append failed: {e}"))?;
    }
    drop(app);
    let mut app = conn.appender("artist_genres").map_err(|e| e.to_string())?;
    let mut n_genres = 0usize;
    for (id, uri, _, _, genres) in &data.artists {
        for g in genres.iter().flatten() {
            app.append_row(params![id.as_str(), uri.as_deref(), g.as_str()])
                .map_err(|e| format!("artist_genres append failed: {e}"))?;
            n_genres += 1;
        }
    }
    drop(app);
    tracing::info!(
        "duckdb: artists + {} artist-genre rows loaded in {} ms",
        n_genres,
        t.elapsed().as_millis()
    );

    let t = Instant::now();
    tracing::info!("duckdb: loading {} albums", data.albums.len());
    let mut app = conn.appender("albums").map_err(|e| e.to_string())?;
    for (id, title, artist, year, album_art, uri, artist_uri) in &data.albums {
        app.append_row(params![
            id.as_str(),
            title.as_str(),
            artist.as_str(),
            *year,
            album_art.as_deref(),
            uri.as_deref(),
            artist_uri.as_deref()
        ])
        .map_err(|e| format!("albums append failed: {e}"))?;
    }
    drop(app);
    tracing::info!("duckdb: albums loaded in {} ms", t.elapsed().as_millis());

    conn.execute_batch(
        "UPDATE tracks
         SET spotify_id = nullif(regexp_extract(spotify_link, 'track/([A-Za-z0-9]+)', 1), '')
         WHERE spotify_link IS NOT NULL;",
    )
    .map_err(|e| format!("spotify_id extraction failed: {e}"))?;

    tracing::info!(
        "duckdb: staging fully loaded in {} ms",
        t_all.elapsed().as_millis()
    );
    Ok(())
}

/// Audio features come from riff's `track_audio_features.parquet` (keyed by
/// Spotify track id, every column VARCHAR — `TRY_CAST` restores the numeric
/// shape). On production that parquet is the **full catalog dump**, far too
/// big to join on every refresh — so features are cached in the serving
/// database, keyed by spotify id, and the parquet is only scanned when tracks
/// with *uncached* ids appear (a hash join against just those ids). Ids the
/// dump doesn't know are remembered in `features_absent` so they are never
/// searched again. Steady state: zero parquet reads per refresh.
///
/// A missing file degrades gracefully: the cache serves whatever it already
/// holds, and content terms fall back to neutral for the rest.
fn sync_features(conn: &duckdb::Connection, path: &str) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS features_cache (
             spotify_id VARCHAR,
             danceability DOUBLE, energy DOUBLE, valence DOUBLE, acousticness DOUBLE,
             instrumentalness DOUBLE, liveness DOUBLE, speechiness DOUBLE,
             tempo DOUBLE, loudness DOUBLE);
         CREATE TABLE IF NOT EXISTS features_absent (spotify_id VARCHAR);",
    )
    .map_err(|e| format!("features cache schema failed: {e}"))?;

    if Path::new(path).is_file() {
        conn.execute_batch(
            "CREATE OR REPLACE TEMP TABLE new_ids AS
             SELECT DISTINCT t.spotify_id FROM tracks t
             ANTI JOIN features_cache fc ON fc.spotify_id = t.spotify_id
             ANTI JOIN features_absent fa ON fa.spotify_id = t.spotify_id
             WHERE t.spotify_id IS NOT NULL;",
        )
        .map_err(|e| format!("new_ids failed: {e}"))?;
        let new_ids: i64 = conn
            .query_row("SELECT count(*) FROM new_ids", [], |r| r.get(0))
            .map_err(|e| format!("counting new_ids failed: {e}"))?;

        if new_ids > 0 {
            let t = Instant::now();
            tracing::info!("features: {new_ids} uncached spotify ids — scanning {path}");
            let escaped = path.replace('\'', "''");
            conn.execute_batch(&format!(
                "INSERT INTO features_cache
                 SELECT f.track_id,
                        TRY_CAST(f.danceability AS DOUBLE), TRY_CAST(f.energy AS DOUBLE),
                        TRY_CAST(f.valence AS DOUBLE), TRY_CAST(f.acousticness AS DOUBLE),
                        TRY_CAST(f.instrumentalness AS DOUBLE), TRY_CAST(f.liveness AS DOUBLE),
                        TRY_CAST(f.speechiness AS DOUBLE), TRY_CAST(f.tempo AS DOUBLE),
                        TRY_CAST(f.loudness AS DOUBLE)
                 FROM read_parquet('{escaped}') f
                 JOIN new_ids n ON n.spotify_id = f.track_id
                 WHERE coalesce(f.null_response, '0') NOT IN ('1', 'true')
                 QUALIFY row_number() OVER (PARTITION BY f.track_id) = 1;
                 INSERT INTO features_absent
                 SELECT n.spotify_id FROM new_ids n
                 ANTI JOIN features_cache fc ON fc.spotify_id = n.spotify_id;"
            ))
            .map_err(|e| format!("features cache build failed: {e}"))?;
            let cached: i64 = conn
                .query_row("SELECT count(*) FROM features_cache", [], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            tracing::info!(
                "features: cache now {cached} rows (scan took {} ms)",
                t.elapsed().as_millis()
            );
        } else {
            tracing::info!("features: cache complete — parquet scan skipped");
        }
        conn.execute_batch("DROP TABLE IF EXISTS new_ids;")
            .map_err(|e| e.to_string())?;
    } else {
        tracing::warn!(
            "features parquet not found at {path}; serving whatever the cache already holds"
        );
    }

    conn.execute_batch("CREATE OR REPLACE VIEW features AS SELECT * FROM features_cache;")
        .map_err(|e| format!("features view failed: {e}"))
}

fn run_pipeline(conn: &duckdb::Connection, cfg: &Config, now_epoch: f64) -> Result<(), String> {
    let lambda = cfg.decay_lambda;
    let beta = cfg.content_weight;
    let neighbours = cfg.neighbours;
    let ser_count = ((cfg.limit_per_user as f64) * cfg.serendipity_ratio).ceil() as usize;
    let main_count = cfg.limit_per_user.saturating_sub(ser_count);
    let limit = cfg.limit_per_user;
    let cand_limit = cfg.candidate_limit.max(cfg.limit_per_user);
    let profile_limit = cfg.profile_limit.max(cfg.limit_per_user);
    // Daily salt so the serendipity picks rotate instead of freezing forever —
    // hash() is deterministic, which keeps a given day's list stable across
    // refreshes but different from yesterday's.
    let day = (now_epoch as i64) / 86400;

    let steps: Vec<(&str, String)> = vec![
        // The profile every signal derives from: each user's most-played
        // tracks, recency-decayed (λ = 0.02/day ≈ 35-day half-life — taste is
        // what they play *now*, not their all-time histogram), plus their
        // loved tracks, which count like a few recent plays so an explicit
        // endorsement stays in the profile even when rarely played. Capped at
        // the top {profile_limit} per user: neighbours, taste vectors and CF
        // candidates all build on this table, so bounding it here bounds the
        // whole pipeline. greatest(...,0) guards clock skew.
        (
            "user_tracks",
            format!(
                "CREATE TABLE user_tracks AS
                 WITH track_artist AS (
                     SELECT track_id, any_value(artist_id) AS artist_id
                     FROM scrobbles WHERE artist_id IS NOT NULL
                     GROUP BY track_id
                 )
                 SELECT user_id, track_id, any_value(artist_id) AS artist_id, sum(w) AS w
                 FROM (
                     SELECT user_id, track_id, artist_id,
                            exp(-{lambda} * greatest(({now_epoch} - ts) / 86400.0, 0)) AS w
                     FROM scrobbles
                     UNION ALL
                     SELECT l.user_id, l.track_id, ta.artist_id, 3.0
                     FROM loved l
                     LEFT JOIN track_artist ta ON ta.track_id = l.track_id
                 )
                 GROUP BY user_id, track_id
                 QUALIFY row_number() OVER (
                     PARTITION BY user_id ORDER BY sum(w) DESC
                 ) <= {profile_limit};"
            ),
        ),
        (
            "user_artists",
            "CREATE TABLE user_artists AS
             SELECT user_id, artist_id, sum(w) AS w
             FROM user_tracks WHERE artist_id IS NOT NULL
             GROUP BY user_id, artist_id;"
                .to_string(),
        ),
        // Proper cosine over decay-weighted artist vectors (the legacy system
        // used raw shared-artist counts, which over-weights big libraries).
        // Bot-flagged accounts are cut out of the neighbour graph entirely.
        (
            "neighbours",
            format!(
                "CREATE TABLE neighbours AS
                 WITH norms AS (
                     SELECT user_id, sqrt(sum(w * w)) AS n FROM user_artists GROUP BY user_id
                 )
                 SELECT u, v, sim FROM (
                     SELECT a.user_id AS u, b.user_id AS v,
                            sum(a.w * b.w) / (any_value(na.n) * any_value(nb.n)) AS sim
                     FROM user_artists a
                     JOIN user_artists b ON b.artist_id = a.artist_id AND b.user_id <> a.user_id
                     JOIN users bu ON bu.id = b.user_id AND NOT bu.is_bot
                     JOIN norms na ON na.user_id = a.user_id
                     JOIN norms nb ON nb.user_id = b.user_id
                     GROUP BY a.user_id, b.user_id
                 )
                 QUALIFY row_number() OVER (PARTITION BY u ORDER BY sim DESC) <= {neighbours};"
            ),
        ),
        (
            "heard",
            "CREATE TABLE heard AS
             SELECT DISTINCT user_id, track_id FROM scrobbles
             UNION
             SELECT user_id, track_id FROM loved;"
                .to_string(),
        ),
        // Collaborative-filtering candidates: what neighbours play, weighted by
        // neighbour similarity and their decayed play counts; a neighbour's
        // loved track is an explicit 5× endorsement. Capped per user right
        // here — the final output keeps only the top ~limit_per_user, and an
        // unbounded candidate set is what made the downstream scoring steps
        // take minutes and run out of memory.
        (
            "cf",
            format!(
                "CREATE TABLE cf AS
                 SELECT n.u AS user_id, ut.track_id,
                        sum(n.sim * ut.w * (CASE WHEN l.track_id IS NOT NULL THEN 5 ELSE 1 END)) AS cf_score,
                        max(CASE WHEN l.track_id IS NOT NULL THEN 1 ELSE 0 END) AS loved
                 FROM neighbours n
                 JOIN user_tracks ut ON ut.user_id = n.v
                 ANTI JOIN heard h ON h.user_id = n.u AND h.track_id = ut.track_id
                 LEFT JOIN loved l ON l.user_id = n.v AND l.track_id = ut.track_id
                 GROUP BY n.u, ut.track_id
                 QUALIFY row_number() OVER (
                     PARTITION BY n.u
                     ORDER BY sum(n.sim * ut.w * (CASE WHEN l.track_id IS NOT NULL THEN 5 ELSE 1 END)) DESC
                 ) <= {cand_limit};"
            ),
        ),
        // Audio-feature vectors, z-scored per dimension across the catalog.
        // Raw Spotify features are all non-negative and correlated, so raw
        // cosine saturates near 1 for everything; standardizing first makes
        // the similarity actually discriminative.
        (
            "track_vec",
            "CREATE TABLE track_vec AS
             WITH raw AS (
                 SELECT t.id AS track_id,
                        f.danceability AS d1, f.energy AS d2, f.valence AS d3,
                        f.acousticness AS d4,
                        coalesce(f.instrumentalness, 0) AS d5,
                        coalesce(f.liveness, 0) AS d6,
                        coalesce(f.speechiness, 0) AS d7,
                        least(f.tempo, 250) / 250.0 AS d8,
                        (greatest(f.loudness, -60) + 60) / 60.0 AS d9
                 FROM tracks t
                 JOIN features f ON f.spotify_id = t.spotify_id
                 WHERE f.danceability IS NOT NULL AND f.energy IS NOT NULL
                   AND f.valence IS NOT NULL AND f.acousticness IS NOT NULL
                   AND f.tempo IS NOT NULL AND f.loudness IS NOT NULL
             ),
             stats AS (
                 SELECT avg(d1) AS m1, coalesce(nullif(stddev_samp(d1), 0), 1) AS s1,
                        avg(d2) AS m2, coalesce(nullif(stddev_samp(d2), 0), 1) AS s2,
                        avg(d3) AS m3, coalesce(nullif(stddev_samp(d3), 0), 1) AS s3,
                        avg(d4) AS m4, coalesce(nullif(stddev_samp(d4), 0), 1) AS s4,
                        avg(d5) AS m5, coalesce(nullif(stddev_samp(d5), 0), 1) AS s5,
                        avg(d6) AS m6, coalesce(nullif(stddev_samp(d6), 0), 1) AS s6,
                        avg(d7) AS m7, coalesce(nullif(stddev_samp(d7), 0), 1) AS s7,
                        avg(d8) AS m8, coalesce(nullif(stddev_samp(d8), 0), 1) AS s8,
                        avg(d9) AS m9, coalesce(nullif(stddev_samp(d9), 0), 1) AS s9
                 FROM raw
             )
             SELECT r.track_id,
                    [(r.d1 - s.m1) / s.s1, (r.d2 - s.m2) / s.s2, (r.d3 - s.m3) / s.s3,
                     (r.d4 - s.m4) / s.s4, (r.d5 - s.m5) / s.s5, (r.d6 - s.m6) / s.s6,
                     (r.d7 - s.m7) / s.s7, (r.d8 - s.m8) / s.s8, (r.d9 - s.m9) / s.s9]::DOUBLE[] AS vec
             FROM raw r, stats s;"
                .to_string(),
        ),
        // A user's taste vector: play-weighted mean of the z-scored features of
        // everything they scrobble. This is the signal Last.fm doesn't have.
        (
            "taste",
            "CREATE TABLE taste AS
             SELECT ut.user_id,
                    [sum(v.vec[1] * ut.w) / sum(ut.w), sum(v.vec[2] * ut.w) / sum(ut.w),
                     sum(v.vec[3] * ut.w) / sum(ut.w), sum(v.vec[4] * ut.w) / sum(ut.w),
                     sum(v.vec[5] * ut.w) / sum(ut.w), sum(v.vec[6] * ut.w) / sum(ut.w),
                     sum(v.vec[7] * ut.w) / sum(ut.w), sum(v.vec[8] * ut.w) / sum(ut.w),
                     sum(v.vec[9] * ut.w) / sum(ut.w)]::DOUBLE[] AS vec
             FROM user_tracks ut
             JOIN track_vec v ON v.track_id = ut.track_id
             GROUP BY ut.user_id;"
                .to_string(),
        ),
        // Scrobble-weighted genre profile; loved tracks count as an explicit
        // endorsement of their artist's genres. Genres under 5 % of listening
        // are noise ("a few K-pop tracks") and dropped.
        (
            "user_top_genres",
            "CREATE TABLE user_top_genres AS
             SELECT user_id, genre FROM (
                 SELECT user_id, genre, w,
                        w / sum(w) OVER (PARTITION BY user_id) AS share,
                        row_number() OVER (PARTITION BY user_id ORDER BY w DESC) AS rn
                 FROM (
                     SELECT user_id, genre, sum(w) AS w FROM (
                         SELECT ua.user_id, ag.genre, ua.w
                         FROM user_artists ua
                         JOIN artist_genres ag ON ag.artist_id = ua.artist_id
                         UNION ALL
                         SELECT l.user_id, ag.genre, 5.0
                         FROM loved l
                         JOIN tracks t ON t.id = l.track_id
                         JOIN artist_genres ag ON ag.artist_uri = t.artist_uri
                     )
                     GROUP BY user_id, genre
                 )
             )
             WHERE share >= 0.05 AND rn <= 10;"
                .to_string(),
        ),
        // Which artists match each user's genre profile, as one compact
        // (user, artist) pair table. Joining candidates → artist_genres →
        // user_top_genres directly multiplies every candidate row by
        // genres-per-artist before aggregating it back down; this table takes
        // that explosion once, up front, instead of per candidate.
        (
            "genre_hits",
            "CREATE TABLE genre_hits AS
             SELECT DISTINCT utg.user_id, ag.artist_uri
             FROM user_top_genres utg
             JOIN artist_genres ag ON ag.genre = utg.genre
             WHERE ag.artist_uri IS NOT NULL;"
                .to_string(),
        ),
        // Final score. Each factor targets a known Last.fm failure mode:
        //   × content^β        — sound-alike ranking from audio features
        //   × genre gate       — soft, with a content escape hatch: a track
        //     outside the user's genres still passes when it *sounds* like
        //     their taste (cos ≥ 0.5). Cross-genre discovery a genre-only
        //     filter can never make.
        //   ÷ ln(e + plays)    — popularity de-bias, so the globally obvious
        //     doesn't drown the personally right.
        (
            "scored",
            format!(
                "CREATE TABLE scored AS
                 WITH gp AS (SELECT track_id, count(*) AS c FROM scrobbles GROUP BY track_id),
                 cand AS (
                     SELECT c.user_id, c.track_id, c.cf_score, c.loved,
                            t.artist_uri, t.artist,
                            list_cosine_similarity(ta.vec, tv.vec) AS cs
                     FROM cf c
                     JOIN tracks t ON t.id = c.track_id
                     LEFT JOIN taste ta ON ta.user_id = c.user_id
                     LEFT JOIN track_vec tv ON tv.track_id = c.track_id
                     WHERE lower(t.artist) <> 'various artists'
                 )
                 SELECT c.user_id, c.track_id, c.artist_uri,
                        c.cf_score
                            * pow(coalesce((1 + c.cs) / 2.0, 0.5), {beta})
                            * (CASE WHEN gh.artist_uri IS NOT NULL THEN 1.0
                                    WHEN c.cs >= 0.5 THEN 0.9
                                    ELSE 0.35 END)
                            / ln(2.718281828459045 + coalesce(gp.c, 0)) AS score,
                        CASE WHEN c.loved = 1 THEN 'social' ELSE 'neighbour' END AS source
                 FROM cand c
                 LEFT JOIN genre_hits gh
                        ON gh.user_id = c.user_id AND gh.artist_uri = c.artist_uri
                 LEFT JOIN gp ON gp.track_id = c.track_id;"
            ),
        ),
        // Top-N with an artist diversity cap: each artist's best track ranks
        // first; runner-up tracks only fill leftover slots.
        (
            "picks",
            format!(
                "CREATE TABLE picks AS
                 SELECT user_id, track_id, score, source, rn FROM (
                     SELECT user_id, track_id, score, source,
                            row_number() OVER (
                                PARTITION BY user_id
                                ORDER BY CASE WHEN ar = 1 THEN 0 ELSE 1 END, score DESC
                            ) AS rn
                     FROM (
                         SELECT *,
                                row_number() OVER (
                                    PARTITION BY user_id, coalesce(artist_uri, track_id)
                                    ORDER BY score DESC
                                ) AS ar
                         FROM scored
                     )
                 )
                 WHERE rn <= {main_count};"
            ),
        ),
        // Serendipity: artists the user has never played, drawn from the
        // neighbour graph, gated on genre overlap OR audio-feature similarity,
        // one track per artist, rotated daily by the hash salt.
        (
            "ser",
            format!(
                "CREATE TABLE ser AS
                 WITH pool AS (
                     SELECT n.u AS user_id, ut.track_id,
                            any_value(t.artist_uri) AS artist_uri
                     FROM neighbours n
                     JOIN user_tracks ut ON ut.user_id = n.v
                     JOIN tracks t ON t.id = ut.track_id
                     ANTI JOIN user_artists ua
                          ON ua.user_id = n.u AND ua.artist_id = ut.artist_id
                     ANTI JOIN heard h ON h.user_id = n.u AND h.track_id = ut.track_id
                     ANTI JOIN picks p ON p.user_id = n.u AND p.track_id = ut.track_id
                     WHERE lower(t.artist) <> 'various artists'
                     GROUP BY n.u, ut.track_id
                     QUALIFY row_number() OVER (
                         PARTITION BY n.u
                         ORDER BY hash(n.u || ut.track_id || '{day}')
                     ) <= {cand_limit}
                 ),
                 eligible AS (
                     SELECT p.user_id, p.track_id, p.artist_uri,
                            (gh.artist_uri IS NOT NULL) AS hit,
                            coalesce(list_cosine_similarity(ta.vec, tv.vec), -1) AS cs
                     FROM pool p
                     LEFT JOIN genre_hits gh
                            ON gh.user_id = p.user_id AND gh.artist_uri = p.artist_uri
                     LEFT JOIN taste ta ON ta.user_id = p.user_id
                     LEFT JOIN track_vec tv ON tv.track_id = p.track_id
                 )
                 SELECT user_id, track_id, 0.0 AS score, 'serendipity' AS source,
                        row_number() OVER (
                            PARTITION BY user_id
                            ORDER BY hash(user_id || track_id || '{day}')
                        ) AS rn
                 FROM (
                     SELECT user_id, track_id, artist_uri FROM eligible
                     WHERE hit OR cs >= 0.3
                     QUALIFY row_number() OVER (
                         PARTITION BY user_id, coalesce(artist_uri, track_id)
                         ORDER BY hash(user_id || track_id || '{day}')
                     ) = 1
                 )
                 QUALIFY row_number() OVER (
                     PARTITION BY user_id
                     ORDER BY hash(user_id || track_id || '{day}')
                 ) <= {ser_count};"
            ),
        ),
        // Cold start: users with no CF candidates get the decayed global chart
        // (bot plays excluded, one track per artist) minus anything they've heard.
        (
            "fallback",
            format!(
                "CREATE TABLE fallback AS
                 WITH gp AS (
                     SELECT s.track_id,
                            sum(exp(-{lambda} * greatest(({now_epoch} - s.ts) / 86400.0, 0))) AS w
                     FROM scrobbles s
                     JOIN users su ON su.id = s.user_id AND NOT su.is_bot
                     GROUP BY s.track_id
                 ),
                 chart AS (
                     SELECT gp.track_id, gp.w
                     FROM gp
                     JOIN tracks t ON t.id = gp.track_id
                     WHERE lower(t.artist) <> 'various artists'
                     QUALIFY row_number() OVER (
                         PARTITION BY coalesce(t.artist_uri, gp.track_id)
                         ORDER BY gp.w DESC
                     ) = 1
                     ORDER BY gp.w DESC LIMIT 200
                 )
                 SELECT u.id AS user_id, c.track_id, 0.0 AS score, 'chart' AS source,
                        row_number() OVER (PARTITION BY u.id ORDER BY c.w DESC) AS rn
                 FROM users u
                 CROSS JOIN chart c
                 ANTI JOIN heard h ON h.user_id = u.id AND h.track_id = c.track_id
                 WHERE u.id NOT IN (SELECT user_id FROM picks)
                 QUALIFY row_number() OVER (PARTITION BY u.id ORDER BY c.w DESC) <= {limit};"
            ),
        ),
        (
            "final",
            "CREATE TABLE final AS
             WITH allrecs AS (
                 SELECT user_id, track_id, score, source, rn, 0 AS grp FROM picks
                 UNION ALL
                 SELECT user_id, track_id, score, source, rn, 1 FROM ser
                 UNION ALL
                 SELECT user_id, track_id, score, source, rn, 2 FROM fallback
             ),
             likes AS (SELECT track_id, count(*) AS c FROM loved GROUP BY track_id),
             tg AS (
                 SELECT artist_uri, list(DISTINCT genre) AS g
                 FROM artist_genres WHERE artist_uri IS NOT NULL
                 GROUP BY artist_uri
             )
             SELECT u.did, u.handle,
                    t.title, t.artist, t.album, t.album_art,
                    t.uri AS track_uri, t.artist_uri, t.album_uri,
                    to_json(tg.g)::VARCHAR AS genres_json,
                    r.score, r.source, coalesce(likes.c, 0) AS likes_count,
                    row_number() OVER (PARTITION BY r.user_id ORDER BY r.grp, r.rn) AS final_rank
             FROM allrecs r
             JOIN users u ON u.id = r.user_id
             JOIN tracks t ON t.id = r.track_id
             LEFT JOIN likes ON likes.track_id = r.track_id
             LEFT JOIN tg ON tg.artist_uri = t.artist_uri;"
                .to_string(),
        ),
        // ───────────────────────── artists ─────────────────────────
        // Full-history exclusion set: user_artists is profile-capped, so
        // recommending from its complement would resurface artists the user
        // played outside the top-{profile_limit}.
        (
            "heard_artists",
            "CREATE TABLE heard_artists AS
             SELECT DISTINCT user_id, artist_id FROM scrobbles WHERE artist_id IS NOT NULL;"
                .to_string(),
        ),
        // An artist's sound = mean of its tracks' z-scored feature vectors.
        (
            "artist_vec",
            "CREATE TABLE artist_vec AS
             SELECT t.artist_uri,
                    [avg(v.vec[1]), avg(v.vec[2]), avg(v.vec[3]), avg(v.vec[4]),
                     avg(v.vec[5]), avg(v.vec[6]), avg(v.vec[7]), avg(v.vec[8]),
                     avg(v.vec[9])]::DOUBLE[] AS vec
             FROM tracks t
             JOIN track_vec v ON v.track_id = t.id
             WHERE t.artist_uri IS NOT NULL
             GROUP BY t.artist_uri;"
                .to_string(),
        ),
        (
            "artist_cf",
            format!(
                "CREATE TABLE artist_cf AS
                 SELECT n.u AS user_id, ua.artist_id, sum(n.sim * ua.w) AS cf_score
                 FROM neighbours n
                 JOIN user_artists ua ON ua.user_id = n.v
                 ANTI JOIN heard_artists h ON h.user_id = n.u AND h.artist_id = ua.artist_id
                 GROUP BY n.u, ua.artist_id
                 QUALIFY row_number() OVER (
                     PARTITION BY n.u ORDER BY sum(n.sim * ua.w) DESC
                 ) <= {cand_limit};"
            ),
        ),
        // Same recipe as track `scored`: CF × content^β × soft genre gate ÷
        // popularity de-bias — with the artist's mean feature vector standing
        // in for the track vector.
        (
            "artist_scored",
            format!(
                "CREATE TABLE artist_scored AS
                 WITH gp AS (
                     SELECT artist_id, count(*) AS c FROM scrobbles
                     WHERE artist_id IS NOT NULL GROUP BY artist_id
                 ),
                 cand AS (
                     SELECT c.user_id, c.artist_id, c.cf_score, a.uri AS artist_uri,
                            list_cosine_similarity(ta.vec, av.vec) AS cs
                     FROM artist_cf c
                     JOIN artists a ON a.id = c.artist_id
                     LEFT JOIN taste ta ON ta.user_id = c.user_id
                     LEFT JOIN artist_vec av ON av.artist_uri = a.uri
                     WHERE lower(a.name) <> 'various artists'
                 )
                 SELECT c.user_id, c.artist_id, c.artist_uri, c.cs,
                        c.cf_score
                            * pow(coalesce((1 + c.cs) / 2.0, 0.5), {beta})
                            * (CASE WHEN gh.artist_uri IS NOT NULL THEN 1.0
                                    WHEN c.cs >= 0.5 THEN 0.9
                                    ELSE 0.35 END)
                            / ln(2.718281828459045 + coalesce(gp.c, 0)) AS score
                 FROM cand c
                 LEFT JOIN genre_hits gh
                        ON gh.user_id = c.user_id AND gh.artist_uri = c.artist_uri
                 LEFT JOIN gp ON gp.artist_id = c.artist_id;"
            ),
        ),
        (
            "artist_picks",
            format!(
                "CREATE TABLE artist_picks AS
                 SELECT user_id, artist_id, score, 'neighbour' AS source,
                        row_number() OVER (PARTITION BY user_id ORDER BY score DESC) AS rn
                 FROM artist_scored
                 QUALIFY rn <= {main_count};"
            ),
        ),
        // Serendipity from the scored tail: not picked, but genre- or
        // sound-adjacent; rotated daily by the hash salt.
        (
            "artist_ser",
            format!(
                "CREATE TABLE artist_ser AS
                 SELECT user_id, artist_id, 0.0 AS score, 'serendipity' AS source,
                        row_number() OVER (
                            PARTITION BY user_id
                            ORDER BY hash(user_id || artist_id || '{day}')
                        ) AS rn
                 FROM (
                     SELECT s.user_id, s.artist_id
                     FROM artist_scored s
                     ANTI JOIN artist_picks p
                          ON p.user_id = s.user_id AND p.artist_id = s.artist_id
                     LEFT JOIN genre_hits gh
                            ON gh.user_id = s.user_id AND gh.artist_uri = s.artist_uri
                     WHERE gh.artist_uri IS NOT NULL OR s.cs >= 0.3
                 )
                 QUALIFY rn <= {ser_count};"
            ),
        ),
        (
            "artist_fallback",
            format!(
                "CREATE TABLE artist_fallback AS
                 WITH gp AS (
                     SELECT s.artist_id,
                            sum(exp(-{lambda} * greatest(({now_epoch} - s.ts) / 86400.0, 0))) AS w
                     FROM scrobbles s
                     JOIN users su ON su.id = s.user_id AND NOT su.is_bot
                     WHERE s.artist_id IS NOT NULL
                     GROUP BY s.artist_id
                 ),
                 chart AS (
                     SELECT gp.artist_id, gp.w
                     FROM gp
                     JOIN artists a ON a.id = gp.artist_id
                     WHERE lower(a.name) <> 'various artists'
                     ORDER BY gp.w DESC LIMIT 200
                 )
                 SELECT u.id AS user_id, c.artist_id, 0.0 AS score, 'chart' AS source,
                        row_number() OVER (PARTITION BY u.id ORDER BY c.w DESC) AS rn
                 FROM users u
                 CROSS JOIN chart c
                 ANTI JOIN heard_artists h ON h.user_id = u.id AND h.artist_id = c.artist_id
                 WHERE u.id NOT IN (SELECT user_id FROM artist_picks)
                 QUALIFY row_number() OVER (PARTITION BY u.id ORDER BY c.w DESC) <= {limit};"
            ),
        ),
        (
            "artist_final",
            "CREATE TABLE artist_final AS
             WITH allrecs AS (
                 SELECT user_id, artist_id, score, source, rn, 0 AS grp FROM artist_picks
                 UNION ALL
                 SELECT user_id, artist_id, score, source, rn, 1 FROM artist_ser
                 UNION ALL
                 SELECT user_id, artist_id, score, source, rn, 2 FROM artist_fallback
             ),
             ag AS (
                 SELECT artist_id, list(DISTINCT genre) AS g
                 FROM artist_genres GROUP BY artist_id
             )
             SELECT u.did, u.handle,
                    a.id AS artist_id, a.uri AS artist_uri, a.name, a.picture,
                    to_json(ag.g)::VARCHAR AS genres_json,
                    r.score, r.source,
                    row_number() OVER (PARTITION BY r.user_id ORDER BY r.grp, r.rn) AS final_rank
             FROM allrecs r
             JOIN users u ON u.id = r.user_id
             JOIN artists a ON a.id = r.artist_id
             LEFT JOIN ag ON ag.artist_id = r.artist_id;"
                .to_string(),
        ),
        // ───────────────────────── albums ─────────────────────────
        // Heard = scrobbles with an album_id, plus albums reached through the
        // scrobbled tracks' album_uri (album_id is nullable on old scrobbles).
        (
            "heard_albums",
            "CREATE TABLE heard_albums AS
             SELECT DISTINCT user_id, album_id FROM scrobbles WHERE album_id IS NOT NULL
             UNION
             SELECT DISTINCT s.user_id, al.id
             FROM scrobbles s
             JOIN tracks t ON t.id = s.track_id
             JOIN albums al ON al.uri = t.album_uri
             WHERE t.album_uri IS NOT NULL;"
                .to_string(),
        ),
        // Two pools, as in the legacy endpoint: unheard albums by artists the
        // user already plays (scored by artist familiarity), and albums by the
        // CF-recommended new artists (scored by the artist's gated CF score).
        (
            "album_pool",
            format!(
                "CREATE TABLE album_pool AS
                 SELECT user_id, album_id, score, source, artist_uri FROM (
                     SELECT *,
                            row_number() OVER (
                                PARTITION BY user_id, album_id
                                ORDER BY CASE source WHEN 'known-artist' THEN 0 ELSE 1 END
                            ) AS dup
                     FROM (
                         SELECT ua.user_id, al.id AS album_id, ua.w AS score,
                                'known-artist' AS source, al.artist_uri
                         FROM user_artists ua
                         JOIN artists a ON a.id = ua.artist_id
                                       AND lower(a.name) <> 'various artists'
                         JOIN albums al ON al.artist_uri = a.uri
                         ANTI JOIN heard_albums h
                              ON h.user_id = ua.user_id AND h.album_id = al.id
                         UNION ALL
                         SELECT s.user_id, al.id, s.score, 'new-artist', al.artist_uri
                         FROM artist_scored s
                         JOIN albums al ON al.artist_uri = s.artist_uri
                         ANTI JOIN heard_albums h
                              ON h.user_id = s.user_id AND h.album_id = al.id
                     )
                 )
                 WHERE dup = 1
                 QUALIFY row_number() OVER (
                     PARTITION BY user_id ORDER BY score DESC
                 ) <= {cand_limit};"
            ),
        ),
        // Artist diversity cap, same as track picks: each artist's best album
        // first, runner-ups fill leftover slots.
        (
            "album_picks",
            format!(
                "CREATE TABLE album_picks AS
                 SELECT user_id, album_id, score, source,
                        row_number() OVER (
                            PARTITION BY user_id
                            ORDER BY CASE WHEN ar = 1 THEN 0 ELSE 1 END, score DESC
                        ) AS rn
                 FROM (
                     SELECT *,
                            row_number() OVER (
                                PARTITION BY user_id, coalesce(artist_uri, album_id)
                                ORDER BY score DESC
                            ) AS ar
                     FROM album_pool
                 )
                 QUALIFY rn <= {limit};"
            ),
        ),
        (
            "album_fallback",
            format!(
                "CREATE TABLE album_fallback AS
                 WITH gp AS (
                     SELECT al.id AS album_id, any_value(al.artist_uri) AS artist_uri,
                            sum(exp(-{lambda} * greatest(({now_epoch} - s.ts) / 86400.0, 0))) AS w
                     FROM scrobbles s
                     JOIN users su ON su.id = s.user_id AND NOT su.is_bot
                     JOIN tracks t ON t.id = s.track_id
                     JOIN albums al ON al.uri = t.album_uri
                     WHERE lower(al.artist) <> 'various artists'
                     GROUP BY al.id
                 ),
                 chart AS (
                     SELECT album_id, w FROM gp
                     QUALIFY row_number() OVER (
                         PARTITION BY coalesce(artist_uri, album_id) ORDER BY w DESC
                     ) = 1
                     ORDER BY w DESC LIMIT 200
                 )
                 SELECT u.id AS user_id, c.album_id, 0.0 AS score, 'chart' AS source,
                        row_number() OVER (PARTITION BY u.id ORDER BY c.w DESC) AS rn
                 FROM users u
                 CROSS JOIN chart c
                 ANTI JOIN heard_albums h ON h.user_id = u.id AND h.album_id = c.album_id
                 WHERE u.id NOT IN (SELECT user_id FROM album_picks)
                 QUALIFY row_number() OVER (PARTITION BY u.id ORDER BY c.w DESC) <= {limit};"
            ),
        ),
        (
            "album_final",
            "CREATE TABLE album_final AS
             WITH allrecs AS (
                 SELECT user_id, album_id, score, source, rn, 0 AS grp FROM album_picks
                 UNION ALL
                 SELECT user_id, album_id, score, source, rn, 1 FROM album_fallback
             )
             SELECT u.did, u.handle,
                    al.id AS album_id, al.uri AS album_uri, al.title, al.artist,
                    al.artist_uri, al.year, al.album_art,
                    r.score, r.source,
                    row_number() OVER (PARTITION BY r.user_id ORDER BY r.grp, r.rn) AS final_rank
             FROM allrecs r
             JOIN users u ON u.id = r.user_id
             JOIN albums al ON al.id = r.album_id;"
                .to_string(),
        ),
    ];

    let total = steps.len();
    for (i, (label, sql)) in steps.iter().enumerate() {
        let t = Instant::now();
        tracing::info!("pipeline [{}/{}]: {label} running", i + 1, total);
        conn.execute_batch(sql)
            .map_err(|e| format!("pipeline step `{label}` failed: {e}"))?;
        tracing::info!(
            "pipeline [{}/{}]: {label} done in {} ms",
            i + 1,
            total,
            t.elapsed().as_millis()
        );
    }
    Ok(())
}
