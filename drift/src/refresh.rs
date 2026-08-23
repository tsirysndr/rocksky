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
use std::path::Path;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// Every transient object a refresh creates, in reverse-dependency order.
/// Dropped before a run (a crashed refresh leaves leftovers) and after.
const STAGING_TABLES: &[&str] = &[
    "final",
    "fallback",
    "ser",
    "picks",
    "scored",
    "user_top_genres",
    "taste",
    "track_vec",
    "cf",
    "heard",
    "neighbours",
    "user_artists",
    "user_tracks",
    "artist_genres",
    "tracks",
    "loved",
    "scrobbles",
    "users",
];

/// Returns (users, rows, took_ms).
pub fn refresh(cfg: &Config, db_url: &str, store: &Store) -> Result<(usize, usize, u128), String> {
    let t0 = Instant::now();
    let now_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs_f64();

    let mut pg = postgres::Client::connect(db_url, postgres::NoTls)
        .map_err(|e| format!("postgres connect failed: {e}"))?;
    let conn = store.conn()?;

    drop_staging(&conn)?;
    create_staging(&conn)?;
    sync_postgres(&mut pg, &conn)?;
    register_features(&conn, &cfg.features_parquet)?;
    run_pipeline(&conn, cfg, now_epoch)?;

    // The swap: readers keep the old `recommendations` until this commits.
    conn.execute_batch("CREATE OR REPLACE TABLE recommendations AS SELECT * FROM final;")
        .map_err(|e| format!("persisting recommendations failed: {e}"))?;

    let (users, rows) = conn
        .query_row(
            "SELECT count(DISTINCT did), count(*) FROM recommendations",
            [],
            |r| Ok((r.get::<_, i64>(0)? as usize, r.get::<_, i64>(1)? as usize)),
        )
        .map_err(|e| format!("counting recommendations failed: {e}"))?;

    let took_ms = t0.elapsed().as_millis();
    conn.execute_batch(&format!(
        "CREATE OR REPLACE TABLE meta AS
         SELECT {}::BIGINT AS refreshed_at_epoch, {}::BIGINT AS took_ms,
                {}::BIGINT AS users, {}::BIGINT AS rows_total;",
        now_epoch as i64, took_ms, users, rows
    ))
    .map_err(|e| format!("persisting meta failed: {e}"))?;

    drop_staging(&conn)?;
    conn.execute_batch("CHECKPOINT;")
        .map_err(|e| format!("checkpoint failed: {e}"))?;

    log::info!("refresh done: {users} users, {rows} rows, {took_ms} ms");
    Ok((users, rows, took_ms))
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
         CREATE TABLE scrobbles (user_id VARCHAR, track_id VARCHAR, artist_id VARCHAR, ts DOUBLE);
         CREATE TABLE loved (user_id VARCHAR, track_id VARCHAR);
         CREATE TABLE tracks (
             id VARCHAR, title VARCHAR, artist VARCHAR, album VARCHAR, album_art VARCHAR,
             uri VARCHAR, artist_uri VARCHAR, album_uri VARCHAR,
             spotify_link VARCHAR, spotify_id VARCHAR);
         CREATE TABLE artist_genres (artist_id VARCHAR, artist_uri VARCHAR, genre VARCHAR);",
    )
    .map_err(|e| format!("staging schema failed: {e}"))
}

/// Copies the five relations drift needs out of Postgres. Volumes are small
/// (hundreds of thousands of rows), so a straight row copy through an Appender
/// beats any incremental scheme in both speed and simplicity.
fn sync_postgres(pg: &mut postgres::Client, conn: &duckdb::Connection) -> Result<(), String> {
    let t = Instant::now();

    let rows = pg
        .query(
            "SELECT user_id, track_id, artist_id, extract(epoch FROM \"timestamp\")::float8
             FROM scrobbles WHERE user_id IS NOT NULL AND track_id IS NOT NULL",
            &[],
        )
        .map_err(|e| format!("scrobbles query failed: {e}"))?;
    let mut app = conn
        .appender("scrobbles")
        .map_err(|e| format!("appender failed: {e}"))?;
    let n_scrobbles = rows.len();
    for r in rows {
        let user_id: String = r.get(0);
        let track_id: String = r.get(1);
        let artist_id: Option<String> = r.get(2);
        let ts: f64 = r.get(3);
        app.append_row(params![user_id, track_id, artist_id, ts])
            .map_err(|e| format!("scrobbles append failed: {e}"))?;
    }
    drop(app);

    let rows = pg
        .query("SELECT user_id, track_id FROM loved_tracks", &[])
        .map_err(|e| format!("loved_tracks query failed: {e}"))?;
    let mut app = conn.appender("loved").map_err(|e| e.to_string())?;
    let n_loved = rows.len();
    for r in rows {
        let user_id: String = r.get(0);
        let track_id: String = r.get(1);
        app.append_row(params![user_id, track_id])
            .map_err(|e| format!("loved append failed: {e}"))?;
    }
    drop(app);

    let rows = pg
        .query("SELECT xata_id, did, handle, is_bot FROM users", &[])
        .map_err(|e| format!("users query failed: {e}"))?;
    let mut app = conn.appender("users").map_err(|e| e.to_string())?;
    let n_users = rows.len();
    for r in rows {
        let id: String = r.get(0);
        let did: String = r.get(1);
        let handle: String = r.get(2);
        let is_bot: bool = r.get(3);
        app.append_row(params![id, did, handle, is_bot])
            .map_err(|e| format!("users append failed: {e}"))?;
    }
    drop(app);

    let rows = pg
        .query(
            "SELECT xata_id, title, artist, album, album_art, uri, artist_uri, album_uri, spotify_link
             FROM tracks",
            &[],
        )
        .map_err(|e| format!("tracks query failed: {e}"))?;
    let mut app = conn.appender("tracks").map_err(|e| e.to_string())?;
    let n_tracks = rows.len();
    for r in rows {
        let id: String = r.get(0);
        let title: Option<String> = r.get(1);
        let artist: Option<String> = r.get(2);
        let album: Option<String> = r.get(3);
        let album_art: Option<String> = r.get(4);
        let uri: Option<String> = r.get(5);
        let artist_uri: Option<String> = r.get(6);
        let album_uri: Option<String> = r.get(7);
        let spotify_link: Option<String> = r.get(8);
        app.append_row(params![
            id,
            title,
            artist,
            album,
            album_art,
            uri,
            artist_uri,
            album_uri,
            spotify_link,
            None::<String>
        ])
        .map_err(|e| format!("tracks append failed: {e}"))?;
    }
    drop(app);

    let rows = pg
        .query(
            "SELECT xata_id, uri, genres FROM artists WHERE genres IS NOT NULL",
            &[],
        )
        .map_err(|e| format!("artists query failed: {e}"))?;
    let mut app = conn.appender("artist_genres").map_err(|e| e.to_string())?;
    let mut n_genres = 0usize;
    for r in rows {
        let id: String = r.get(0);
        let uri: Option<String> = r.get(1);
        let genres: Vec<String> = r.get(2);
        for g in genres {
            app.append_row(params![id, uri, g])
                .map_err(|e| format!("artist_genres append failed: {e}"))?;
            n_genres += 1;
        }
    }
    drop(app);

    conn.execute_batch(
        "UPDATE tracks
         SET spotify_id = nullif(regexp_extract(spotify_link, 'track/([A-Za-z0-9]+)', 1), '')
         WHERE spotify_link IS NOT NULL;",
    )
    .map_err(|e| format!("spotify_id extraction failed: {e}"))?;

    log::info!(
        "postgres sync: {n_scrobbles} scrobbles, {n_loved} loved, {n_users} users, {n_tracks} tracks, {n_genres} artist-genre rows in {} ms",
        t.elapsed().as_millis()
    );
    Ok(())
}

/// Audio features come from riff's `track_audio_features.parquet` (keyed by
/// Spotify track id, every column VARCHAR — `TRY_CAST` restores the numeric
/// shape, one malformed cell becomes a null field). A missing file degrades
/// gracefully: the view is empty and every content term falls back to neutral.
fn register_features(conn: &duckdb::Connection, path: &str) -> Result<(), String> {
    if Path::new(path).is_file() {
        let escaped = path.replace('\'', "''");
        conn.execute_batch(&format!(
            "CREATE OR REPLACE VIEW features AS
             SELECT track_id AS spotify_id,
                    TRY_CAST(danceability AS DOUBLE) AS danceability,
                    TRY_CAST(energy AS DOUBLE) AS energy,
                    TRY_CAST(valence AS DOUBLE) AS valence,
                    TRY_CAST(acousticness AS DOUBLE) AS acousticness,
                    TRY_CAST(instrumentalness AS DOUBLE) AS instrumentalness,
                    TRY_CAST(liveness AS DOUBLE) AS liveness,
                    TRY_CAST(speechiness AS DOUBLE) AS speechiness,
                    TRY_CAST(tempo AS DOUBLE) AS tempo,
                    TRY_CAST(loudness AS DOUBLE) AS loudness
             FROM read_parquet('{escaped}')
             WHERE coalesce(null_response, '0') NOT IN ('1', 'true');"
        ))
        .map_err(|e| format!("features view failed: {e}"))
    } else {
        log::warn!(
            "features parquet not found at {path}; recommendations will run without the audio-feature signal"
        );
        conn.execute_batch(
            "CREATE OR REPLACE VIEW features AS
             SELECT NULL::VARCHAR AS spotify_id,
                    NULL::DOUBLE AS danceability, NULL::DOUBLE AS energy,
                    NULL::DOUBLE AS valence, NULL::DOUBLE AS acousticness,
                    NULL::DOUBLE AS instrumentalness, NULL::DOUBLE AS liveness,
                    NULL::DOUBLE AS speechiness, NULL::DOUBLE AS tempo,
                    NULL::DOUBLE AS loudness
             WHERE 1 = 0;",
        )
        .map_err(|e| format!("empty features view failed: {e}"))
    }
}

fn run_pipeline(conn: &duckdb::Connection, cfg: &Config, now_epoch: f64) -> Result<(), String> {
    let lambda = cfg.decay_lambda;
    let beta = cfg.content_weight;
    let neighbours = cfg.neighbours;
    let ser_count = ((cfg.limit_per_user as f64) * cfg.serendipity_ratio).ceil() as usize;
    let main_count = cfg.limit_per_user.saturating_sub(ser_count);
    let limit = cfg.limit_per_user;
    // Daily salt so the serendipity picks rotate instead of freezing forever —
    // hash() is deterministic, which keeps a given day's list stable across
    // refreshes but different from yesterday's.
    let day = (now_epoch as i64) / 86400;

    let steps: Vec<(&str, String)> = vec![
        // Recency-decayed play weights. λ = 0.02/day ≈ 35-day half-life: taste
        // is what the user plays *now*, not their all-time histogram (Last.fm
        // profiles famously fossilize). greatest(...,0) guards clock skew.
        (
            "user_tracks",
            format!(
                "CREATE TABLE user_tracks AS
                 SELECT user_id, track_id, any_value(artist_id) AS artist_id,
                        sum(exp(-{lambda} * greatest(({now_epoch} - ts) / 86400.0, 0))) AS w
                 FROM scrobbles
                 GROUP BY user_id, track_id;"
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
        // loved track is an explicit 5× endorsement.
        (
            "cf",
            "CREATE TABLE cf AS
             SELECT n.u AS user_id, ut.track_id,
                    sum(n.sim * ut.w * (CASE WHEN l.track_id IS NOT NULL THEN 5 ELSE 1 END)) AS cf_score,
                    max(CASE WHEN l.track_id IS NOT NULL THEN 1 ELSE 0 END) AS loved
             FROM neighbours n
             JOIN user_tracks ut ON ut.user_id = n.v
             ANTI JOIN heard h ON h.user_id = n.u AND h.track_id = ut.track_id
             LEFT JOIN loved l ON l.user_id = n.v AND l.track_id = ut.track_id
             GROUP BY n.u, ut.track_id;"
                .to_string(),
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
                 ),
                 g AS (
                     SELECT c.user_id, c.track_id,
                            max(CASE WHEN utg.genre IS NOT NULL THEN 1 ELSE 0 END) AS hit
                     FROM cand c
                     LEFT JOIN artist_genres ag ON ag.artist_uri = c.artist_uri
                     LEFT JOIN user_top_genres utg
                            ON utg.user_id = c.user_id AND utg.genre = ag.genre
                     GROUP BY c.user_id, c.track_id
                 )
                 SELECT c.user_id, c.track_id, c.artist_uri,
                        c.cf_score
                            * pow(coalesce((1 + c.cs) / 2.0, 0.5), {beta})
                            * (CASE WHEN g.hit = 1 THEN 1.0
                                    WHEN c.cs >= 0.5 THEN 0.9
                                    ELSE 0.35 END)
                            / ln(2.718281828459045 + coalesce(gp.c, 0)) AS score,
                        CASE WHEN c.loved = 1 THEN 'social' ELSE 'neighbour' END AS source
                 FROM cand c
                 JOIN g ON g.user_id = c.user_id AND g.track_id = c.track_id
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
                            any_value(t.artist_uri) AS artist_uri,
                            any_value(t.artist) AS artist
                     FROM neighbours n
                     JOIN user_tracks ut ON ut.user_id = n.v
                     JOIN tracks t ON t.id = ut.track_id
                     ANTI JOIN user_artists ua
                          ON ua.user_id = n.u AND ua.artist_id = ut.artist_id
                     ANTI JOIN heard h ON h.user_id = n.u AND h.track_id = ut.track_id
                     ANTI JOIN picks p ON p.user_id = n.u AND p.track_id = ut.track_id
                     WHERE lower(t.artist) <> 'various artists'
                     GROUP BY n.u, ut.track_id
                 ),
                 eligible AS (
                     SELECT p.user_id, p.track_id,
                            any_value(p.artist_uri) AS artist_uri,
                            max(CASE WHEN utg.genre IS NOT NULL THEN 1 ELSE 0 END) AS hit,
                            any_value(coalesce(list_cosine_similarity(ta.vec, tv.vec), -1)) AS cs
                     FROM pool p
                     LEFT JOIN artist_genres ag ON ag.artist_uri = p.artist_uri
                     LEFT JOIN user_top_genres utg
                            ON utg.user_id = p.user_id AND utg.genre = ag.genre
                     LEFT JOIN taste ta ON ta.user_id = p.user_id
                     LEFT JOIN track_vec tv ON tv.track_id = p.track_id
                     GROUP BY p.user_id, p.track_id
                 )
                 SELECT user_id, track_id, 0.0 AS score, 'serendipity' AS source,
                        row_number() OVER (
                            PARTITION BY user_id
                            ORDER BY hash(user_id || track_id || '{day}')
                        ) AS rn
                 FROM (
                     SELECT user_id, track_id, artist_uri FROM eligible
                     WHERE hit = 1 OR cs >= 0.3
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
    ];

    for (label, sql) in steps {
        let t = Instant::now();
        conn.execute_batch(&sql)
            .map_err(|e| format!("pipeline step `{label}` failed: {e}"))?;
        log::info!("pipeline: {label} in {} ms", t.elapsed().as_millis());
    }
    Ok(())
}
