//! Writes a small, self-contained catalog in the exact shape of the production
//! Parquet dump, so riff can be developed and tested without pulling down
//! hundreds of gigabytes.
//!
//! The catalog is fictional on purpose — inventing popularity scores and audio
//! features for real artists would produce fixtures that look authoritative and
//! are not. The *schema* is what has to match, and it does, column for column.
//!
//!     cargo run --bin riff-fixtures -- --out testdata
//!
//! Internally the tables use `row_id`; each `COPY` renames it back to `rowid` so
//! the emitted files are indistinguishable from prod's.

use duckdb::Connection;
use std::path::Path;

/// `fetched_at` is a fixed epoch second rather than "now": regenerating the
/// fixtures must not produce a diff.
const FETCHED_AT: i64 = 1_719_792_000;

const SCHEMA: &str = r#"
CREATE TABLE artists (
    row_id BIGINT, id VARCHAR, fetched_at BIGINT, name VARCHAR,
    followers_total BIGINT, popularity BIGINT
);
INSERT INTO artists VALUES
    (1, 'riffart000000000000001', $FETCHED_AT, 'Ash Meridian',      812450, 71),
    (2, 'riffart000000000000002', $FETCHED_AT, 'Kova Lune',        2310004, 84),
    (3, 'riffart000000000000003', $FETCHED_AT, 'The Paper Tigers',  154902, 58),
    (4, 'riffart000000000000004', $FETCHED_AT, 'Marisol Vega',     5120777, 90),
    (5, 'riffart000000000000005', $FETCHED_AT, 'Nightbus Choir',     42118, 41),
    (6, 'riffart000000000000006', $FETCHED_AT, 'Odessa Grey',       690233, 66),
    (7, 'riffart000000000000007', $FETCHED_AT, 'Various Artists',    12004, 30);

CREATE TABLE artist_genres (artist_rowid BIGINT, genre VARCHAR);
INSERT INTO artist_genres VALUES
    (1, 'indie rock'), (1, 'chamber pop'),
    (2, 'electronic'), (2, 'synthwave'), (2, 'deep house'),
    (3, 'garage rock'), (3, 'indie rock'),
    (4, 'latin pop'), (4, 'pop'),
    (5, 'choral'), (5, 'ambient'),
    (6, 'trip hop'), (6, 'downtempo');

-- Two distinct market sets, referenced by row id from albums and tracks alike;
-- that indirection is exactly how the production dump stores them.
CREATE TABLE available_markets (row_id BIGINT, markets VARCHAR);
INSERT INTO available_markets VALUES
    (1, 'AR,AU,BR,CA,DE,ES,FR,GB,IT,JP,MX,NL,SE,US'),
    (2, 'CA,US');

CREATE TABLE albums (
    row_id BIGINT, id VARCHAR, fetched_at BIGINT, name VARCHAR, album_type VARCHAR,
    available_markets_rowid BIGINT, external_id_upc VARCHAR, copyright_c VARCHAR,
    copyright_p VARCHAR, label VARCHAR, popularity BIGINT, release_date VARCHAR,
    release_date_precision VARCHAR, total_tracks BIGINT, external_id_amgid VARCHAR
);
INSERT INTO albums VALUES
    (1,  'riffalb000000000000001', $FETCHED_AT, 'Low Country',          'album',       1, '00602537000011', '2019 Fathom Line',            '2019 Fathom Line',            'Fathom Line',             68, '2019-04-12', 'day',  5, NULL),
    (2,  'riffalb000000000000002', $FETCHED_AT, 'Hollow Season',        'album',       1, '00602537000028', '2022 Fathom Line',            '2022 Fathom Line',            'Fathom Line',             74, '2022-09-30', 'day',  4, NULL),
    (3,  'riffalb000000000000003', $FETCHED_AT, 'Neon Tide',            'album',       1, '00602537000035', '2021 Halcyon Recordings',     '2021 Halcyon Recordings',     'Halcyon Recordings',      86, '2021-06-04', 'day',  6, 'R  1889321'),
    (4,  'riffalb000000000000004', $FETCHED_AT, 'Neon Tide (Remixes)',  'single',      2, '00602537000042', '2021 Halcyon Recordings',     '2021 Halcyon Recordings',     'Halcyon Recordings',      79, '2021-11-19', 'day',  2, NULL),
    (5,  'riffalb000000000000005', $FETCHED_AT, 'Paper Tigers',         'album',       1, '00602537000059', '2017 Sixth Street Records',   '2017 Sixth Street Records',   'Sixth Street Records',    55, '2017-03-03', 'day',  4, NULL),
    (6,  'riffalb000000000000006', $FETCHED_AT, 'Salt & Static',        'album',       1, '00602537000066', '2023 Vega Musica',            '2023 Vega Musica',            'Vega Musica',             91, '2023-01-27', 'day',  5, NULL),
    (7,  'riffalb000000000000007', $FETCHED_AT, 'Vega Sessions',        'single',      1, '00602537000073', '2024 Vega Musica',            '2024 Vega Musica',            'Vega Musica',             88, '2024-05-10', 'day',  2, NULL),
    -- No label, no copyright, narrower markets: exercises the nullable columns.
    (8,  'riffalb000000000000008', $FETCHED_AT, 'Last Bus Home',        'album',       2, NULL,             NULL,                          NULL,                          'Nightbus Collective',     38, '2020-10-16', 'day',  4, NULL),
    -- Year-only release precision, which Spotify clients must not parse as a date.
    (9,  'riffalb000000000000009', $FETCHED_AT, 'Grey Matter',          'album',       1, '00602537000097', '2018 Static Field',           '2018 Static Field',           'Static Field',            61, '2018',       'year', 4, NULL),
    (10, 'riffalb000000000000010', $FETCHED_AT, 'Riff Sampler Vol. 1',  'compilation', 1, '00602537000103', '2023 Rocksky Test Recordings', '2023 Rocksky Test Recordings', 'Rocksky Test Recordings', 44, '2023-11-03', 'day',  4, NULL);

-- is_appears_on = 0 is an artist's own album; = 1 is a compilation credit. The
-- sampler has "Various Artists" as its own artist plus four appears_on credits,
-- so /artists/{id}/albums?include_groups=appears_on has something to return.
CREATE TABLE artist_albums (
    artist_rowid BIGINT, album_rowid BIGINT, is_appears_on BIGINT,
    is_implicit_appears_on BIGINT, index_in_album BIGINT
);
INSERT INTO artist_albums VALUES
    (1, 1, 0, 0, 0), (1, 2, 0, 0, 0),
    (2, 3, 0, 0, 0), (2, 4, 0, 0, 0),
    (3, 5, 0, 0, 0),
    (4, 6, 0, 0, 0), (4, 7, 0, 0, 0),
    (5, 8, 0, 0, 0),
    (6, 9, 0, 0, 0),
    (7, 10, 0, 0, 0),
    (1, 10, 1, 0, 0), (2, 10, 1, 0, 1), (4, 10, 1, 0, 2), (6, 10, 1, 0, 3);

CREATE TABLE tracks (
    row_id BIGINT, id VARCHAR, fetched_at BIGINT, name VARCHAR, preview_url VARCHAR,
    album_rowid BIGINT, track_number BIGINT, external_id_isrc VARCHAR, popularity BIGINT,
    available_markets_rowid BIGINT, disc_number BIGINT, duration_ms BIGINT, explicit BIGINT
);
INSERT INTO tracks
SELECT
    n,
    'rifftrk' || lpad(n::VARCHAR, 15, '0'),
    $FETCHED_AT,
    name,
    -- A quarter of the catalog has no preview, as on the real thing.
    CASE WHEN n % 4 = 0 THEN NULL
         ELSE 'https://p.scdn.co/mp3-preview/riff' || lpad(n::VARCHAR, 5, '0') END,
    album_rowid,
    track_number,
    'GBRFF' || substr(release_date, 3, 2) || lpad(n::VARCHAR, 5, '0'),
    ((hash(n * 7 + 3) % 100))::BIGINT,
    markets,
    1,
    (150000 + (hash(n * 13 + 5) % 180000))::BIGINT,
    explicit
FROM (
    SELECT
        row_number() OVER (ORDER BY s.album_rowid, s.track_number) AS n,
        s.album_rowid, s.track_number, s.name, s.explicit,
        al.release_date, al.available_markets_rowid AS markets
    FROM (VALUES
        (1, 1, 'Coastal Road', 0),
        (1, 2, 'Low Country', 0),
        (1, 3, 'Winter Ferry', 0),
        (1, 4, 'Salt Marsh', 0),
        (1, 5, 'The Long Way Down', 0),
        (2, 1, 'Hollow Season', 0),
        (2, 2, 'Paper Lantern', 0),
        (2, 3, 'Undertow', 1),
        (2, 4, 'Nine Volt', 0),
        (3, 1, 'Neon Tide', 0),
        (3, 2, 'Midnight Transit', 0),
        (3, 3, 'Glasshouse', 0),
        (3, 4, 'Afterimage', 0),
        (3, 5, 'Slow Signal (feat. Marisol Vega)', 0),
        (3, 6, 'Terminal Bloom', 0),
        (4, 1, 'Neon Tide - Odessa Grey Remix', 0),
        (4, 2, 'Glasshouse - Extended Mix', 0),
        (5, 1, 'Paper Tigers', 0),
        (5, 2, 'Static Hymn', 0),
        (5, 3, 'Broken Compass', 1),
        (5, 4, 'Radio Silence', 0),
        (6, 1, 'Salt & Static', 0),
        (6, 2, 'Corazon Electrico', 0),
        (6, 3, 'Vega', 0),
        (6, 4, 'Ninety Nine Nights', 0),
        (6, 5, 'Fever Map', 0),
        (7, 1, 'Vega (Acoustic)', 0),
        (7, 2, 'Fever Map (Live)', 0),
        (8, 1, 'Last Bus Home', 0),
        (8, 2, 'Choir Practice', 0),
        (8, 3, 'Streetlight Chorus', 0),
        (8, 4, 'Four in the Morning', 0),
        (9, 1, 'Grey Matter', 0),
        (9, 2, 'Slow Dissolve', 0),
        (9, 3, 'Cathode', 0),
        (9, 4, 'Halogen', 0),
        (10, 1, 'Coastal Road', 0),
        (10, 2, 'Neon Tide', 0),
        (10, 3, 'Vega', 0),
        (10, 4, 'Grey Matter', 0)
    ) AS s(album_rowid, track_number, name, explicit)
    JOIN albums al ON al.row_id = s.album_rowid
);

-- The production dump may not carry this relation; riff falls back to album
-- artists when track_artists.parquet is absent. Generating it here means the
-- featured-artist and compilation paths are actually covered by the fixtures.
CREATE TABLE track_artists (track_rowid BIGINT, artist_rowid BIGINT, index_in_track BIGINT);
INSERT INTO track_artists
SELECT t.row_id, aa.artist_rowid, 0
FROM tracks t
JOIN artist_albums aa ON aa.album_rowid = t.album_rowid AND aa.is_appears_on = 0
WHERE t.album_rowid <> 10
UNION ALL
-- Sampler tracks are credited to the artist who actually recorded them, not to
-- "Various Artists".
SELECT * FROM (VALUES (37, 1, 0), (38, 2, 0), (39, 4, 0), (40, 6, 0)) v(a, b, c)
UNION ALL
-- Featured credits: "Slow Signal (feat. Marisol Vega)" and the Odessa Grey remix.
SELECT * FROM (VALUES (14, 4, 1), (16, 6, 1)) v(a, b, c);

CREATE TABLE artist_images (artist_rowid BIGINT, width BIGINT, height BIGINT, url VARCHAR);
INSERT INTO artist_images
SELECT a.row_id, s.w::BIGINT, s.w::BIGINT,
       'https://i.scdn.co/image/riff-artist-' || a.row_id || '-' || s.w
FROM artists a CROSS JOIN (VALUES (640), (320), (160)) s(w);

CREATE TABLE album_images (album_rowid BIGINT, width BIGINT, height BIGINT, url VARCHAR);
INSERT INTO album_images
SELECT al.row_id, s.w::BIGINT, s.w::BIGINT,
       'https://i.scdn.co/image/riff-album-' || al.row_id || '-' || s.w
FROM albums al CROSS JOIN (VALUES (640), (300), (64)) s(w);

-- Every column is VARCHAR, matching prod exactly — including the numeric ones.
-- Track 40 carries null_response = '1' with all features NULL, which is how the
-- dump records "Spotify had no analysis for this track"; riff must answer null
-- for it rather than a row of zeroes.
CREATE TABLE track_audio_features (
    row_id VARCHAR, track_id VARCHAR, fetched_at VARCHAR, null_response VARCHAR,
    duration_ms VARCHAR, time_signature VARCHAR, tempo VARCHAR, "key" VARCHAR, "mode" VARCHAR,
    danceability VARCHAR, energy VARCHAR, loudness VARCHAR, speechiness VARCHAR,
    acousticness VARCHAR, instrumentalness VARCHAR, liveness VARCHAR, valence VARCHAR
);
INSERT INTO track_audio_features
SELECT
    t.row_id::VARCHAR,
    t.id,
    '$FETCHED_AT',
    CASE WHEN missing THEN '1' ELSE '0' END,
    CASE WHEN missing THEN NULL ELSE t.duration_ms::VARCHAR END,
    CASE WHEN missing THEN NULL ELSE (3 + (hash(t.row_id * 3) % 3))::VARCHAR END,
    CASE WHEN missing THEN NULL ELSE round(70 + (hash(t.row_id * 11) % 9000) / 100.0, 3)::VARCHAR END,
    CASE WHEN missing THEN NULL ELSE (hash(t.row_id * 17) % 12)::VARCHAR END,
    CASE WHEN missing THEN NULL ELSE (hash(t.row_id * 19) % 2)::VARCHAR END,
    CASE WHEN missing THEN NULL ELSE round((hash(t.row_id * 23) % 1000) / 1000.0, 3)::VARCHAR END,
    CASE WHEN missing THEN NULL ELSE round((hash(t.row_id * 29) % 1000) / 1000.0, 3)::VARCHAR END,
    CASE WHEN missing THEN NULL ELSE round(-20 + (hash(t.row_id * 31) % 1800) / 100.0, 3)::VARCHAR END,
    CASE WHEN missing THEN NULL ELSE round((hash(t.row_id * 37) % 400) / 1000.0, 3)::VARCHAR END,
    CASE WHEN missing THEN NULL ELSE round((hash(t.row_id * 41) % 1000) / 1000.0, 3)::VARCHAR END,
    CASE WHEN missing THEN NULL ELSE round((hash(t.row_id * 43) % 1000) / 1000.0, 3)::VARCHAR END,
    CASE WHEN missing THEN NULL ELSE round((hash(t.row_id * 47) % 1000) / 1000.0, 3)::VARCHAR END,
    CASE WHEN missing THEN NULL ELSE round((hash(t.row_id * 53) % 1000) / 1000.0, 3)::VARCHAR END
FROM (SELECT *, row_id = 40 AS missing FROM tracks) t;
"#;

/// `(file stem, projection)`. The projection restores `rowid` as the column name
/// wherever the internal table calls it `row_id`.
const EXPORTS: &[(&str, &str)] = &[
    (
        "artists",
        "SELECT row_id AS rowid, id, fetched_at, name, followers_total, popularity \
         FROM artists ORDER BY row_id",
    ),
    (
        "artist_genres",
        "SELECT artist_rowid, genre FROM artist_genres ORDER BY artist_rowid, genre",
    ),
    (
        "artist_images",
        "SELECT artist_rowid, width, height, url FROM artist_images \
         ORDER BY artist_rowid, width DESC",
    ),
    (
        "albums",
        "SELECT row_id AS rowid, id, fetched_at, name, album_type, available_markets_rowid, \
                external_id_upc, copyright_c, copyright_p, label, popularity, release_date, \
                release_date_precision, total_tracks, external_id_amgid \
         FROM albums ORDER BY row_id",
    ),
    (
        "album_images",
        "SELECT album_rowid, width, height, url FROM album_images ORDER BY album_rowid, width DESC",
    ),
    (
        "artist_albums",
        "SELECT artist_rowid, album_rowid, is_appears_on, is_implicit_appears_on, index_in_album \
         FROM artist_albums ORDER BY artist_rowid, album_rowid",
    ),
    (
        "tracks",
        "SELECT row_id AS rowid, id, fetched_at, name, preview_url, album_rowid, track_number, \
                external_id_isrc, popularity, available_markets_rowid, disc_number, duration_ms, explicit \
         FROM tracks ORDER BY row_id",
    ),
    (
        "track_artists",
        "SELECT track_rowid, artist_rowid, index_in_track FROM track_artists \
         ORDER BY track_rowid, index_in_track",
    ),
    (
        "track_audio_features",
        "SELECT row_id AS rowid, track_id, fetched_at, null_response, duration_ms, time_signature, \
                tempo, \"key\", \"mode\", danceability, energy, loudness, speechiness, acousticness, \
                instrumentalness, liveness, valence \
         FROM track_audio_features ORDER BY TRY_CAST(row_id AS BIGINT)",
    ),
    (
        "available_markets",
        "SELECT row_id AS rowid, markets FROM available_markets ORDER BY row_id",
    ),
];

/// One generated file: table name, row count, size on disk.
pub struct Written {
    pub name: &'static str,
    pub rows: i64,
    pub bytes: u64,
}

/// Builds the fixture catalog in memory and writes one Parquet file per table
/// into `out`, creating the directory if needed. Overwrites what is there.
pub fn generate(out: &Path) -> Result<Vec<Written>, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(out)?;

    let conn = Connection::open_in_memory()?;
    conn.execute_batch(&SCHEMA.replace("$FETCHED_AT", &FETCHED_AT.to_string()))?;

    let mut written = Vec::with_capacity(EXPORTS.len());
    for (name, projection) in EXPORTS {
        let path = out.join(format!("{name}.parquet"));
        let target = path.to_string_lossy().replace('\'', "''");
        conn.execute_batch(&format!(
            "COPY ({projection}) TO '{target}' (FORMAT PARQUET, COMPRESSION ZSTD)"
        ))?;
        let rows: i64 =
            conn.query_row(&format!("SELECT COUNT(*) FROM ({projection})"), [], |r| {
                r.get(0)
            })?;
        written.push(Written {
            name,
            rows,
            bytes: std::fs::metadata(&path)?.len(),
        });
    }
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The fixtures exist to stand in for the production dump, so the thing
    /// worth asserting is that they carry prod's column names — `rowid`, not the
    /// `row_id` used internally — and prod's types, including the all-VARCHAR
    /// audio features.
    #[test]
    fn emitted_files_match_the_production_schema() {
        let dir = tempfile::tempdir().unwrap();
        let written = generate(dir.path()).unwrap();
        assert_eq!(written.len(), EXPORTS.len());

        let conn = Connection::open_in_memory().unwrap();
        let describe = |table: &str| -> Vec<(String, String)> {
            let path = dir.path().join(format!("{table}.parquet"));
            let mut stmt = conn
                .prepare(&format!(
                    "DESCRIBE SELECT * FROM read_parquet('{}')",
                    path.display()
                ))
                .unwrap();
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        };

        assert_eq!(
            describe("artists"),
            vec![
                ("rowid".into(), "BIGINT".into()),
                ("id".into(), "VARCHAR".into()),
                ("fetched_at".into(), "BIGINT".into()),
                ("name".into(), "VARCHAR".into()),
                ("followers_total".into(), "BIGINT".into()),
                ("popularity".into(), "BIGINT".into()),
            ]
        );

        assert_eq!(
            describe("artist_genres"),
            vec![
                ("artist_rowid".into(), "BIGINT".into()),
                ("genre".into(), "VARCHAR".into()),
            ]
        );

        assert_eq!(
            describe("album_images"),
            vec![
                ("album_rowid".into(), "BIGINT".into()),
                ("width".into(), "BIGINT".into()),
                ("height".into(), "BIGINT".into()),
                ("url".into(), "VARCHAR".into()),
            ]
        );

        // Prod stores every audio-feature column as VARCHAR; if the fixtures
        // emitted real numerics they would silently not exercise riff's casts.
        let features = describe("track_audio_features");
        assert_eq!(features.len(), 17);
        assert!(
            features.iter().all(|(_, ty)| ty == "VARCHAR"),
            "expected every audio-feature column to be VARCHAR, got {features:?}"
        );
        assert_eq!(features[0].0, "rowid");
        assert_eq!(features[1].0, "track_id");
    }

    #[test]
    fn generation_is_deterministic() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        generate(a.path()).unwrap();
        generate(b.path()).unwrap();
        for (name, _) in EXPORTS {
            let x = std::fs::read(a.path().join(format!("{name}.parquet"))).unwrap();
            let y = std::fs::read(b.path().join(format!("{name}.parquet"))).unwrap();
            assert_eq!(x, y, "{name}.parquet differs between runs");
        }
    }

    #[test]
    fn track_totals_agree_with_the_album_rows() {
        let dir = tempfile::tempdir().unwrap();
        generate(dir.path()).unwrap();
        let conn = Connection::open_in_memory().unwrap();
        let mismatched: i64 = conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM read_parquet('{}') al \
                     WHERE al.total_tracks <> (SELECT COUNT(*) FROM read_parquet('{}') t \
                                               WHERE t.album_rowid = al.rowid)",
                    dir.path().join("albums.parquet").display(),
                    dir.path().join("tracks.parquet").display(),
                ),
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(mismatched, 0, "albums.total_tracks disagrees with tracks");
    }
}
