use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::artist::{ArtistRow, ArtistWithStats};

/// The caller's own uploads, and the artists reachable from them.
///
/// This walks outward from `user_uploads` rather than inward from `artists`.
/// The catalogue tables are global — every scrobble by every Rocksky user lands
/// in them, so `artists` holds 65k rows and `tracks` 547k — while everyone's
/// uploads put together are 10k rows. Scanning `artists` and testing each row
/// with a correlated EXISTS therefore did work proportional to the catalogue
/// instead of to the library being listed: 65k index searches into `tracks`,
/// 506k into `user_uploads`, ~10s for the largest library. Starting from the
/// uploads makes it 0.8s for byte-identical output.
///
/// MATERIALIZED is load-bearing. Inlined, the planner hoists `artists` back to
/// the driving position, merge-joins 64k of them against the library and
/// rebuilds a 245k-row intermediate — the exact shape this avoids.
///
/// `tr.album_artist = artists.name` on every junction join stays: artist_tracks
/// has polluted entries linking tracks to artists they don't credit, and
/// without the guard a single stray row puts a stranger's artist in the
/// caller's library. See commit 8f06a470.
const MINE_ARTISTS_CTE: &str = r#"
WITH mine AS MATERIALIZED (
    SELECT uu.track_id, t.album_artist
    FROM user_uploads uu
    JOIN tracks t ON t.xata_id = uu.track_id
    WHERE uu.user_id = $1
),
mine_albums AS MATERIALIZED (
    SELECT DISTINCT atr.album_id, m.album_artist
    FROM mine m
    JOIN album_tracks atr ON atr.track_id = m.track_id
),
album_counts AS MATERIALIZED (
    SELECT aa.artist_id, COUNT(DISTINCT aa.album_id) AS album_count
    FROM mine_albums ma
    JOIN artist_albums aa ON aa.album_id = ma.album_id
    JOIN artists ar ON ar.xata_id = aa.artist_id AND ar.name = ma.album_artist
    GROUP BY aa.artist_id
),
mine_artists AS MATERIALIZED (
    SELECT DISTINCT atk.artist_id
    FROM mine m
    JOIN artist_tracks atk ON atk.track_id = m.track_id
    JOIN artists ar ON ar.xata_id = atk.artist_id AND ar.name = m.album_artist
)
"#;

pub async fn get_all_artists(
    pool: &Pool<Postgres>,
    user_id: &str,
) -> Result<Vec<ArtistWithStats>, Error> {
    let rows: Vec<ArtistWithStats> = sqlx::query_as(&format!(
        r#"
        {MINE_ARTISTS_CTE}
        SELECT
            artists.xata_id,
            artists.name,
            artists.picture,
            COALESCE(ac.album_count, 0) AS album_count
        FROM mine_artists ma
        JOIN artists ON artists.xata_id = ma.artist_id
        LEFT JOIN album_counts ac ON ac.artist_id = ma.artist_id
        ORDER BY artists.name ASC, artists.xata_id ASC
        "#
    ))
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_artist_by_id(
    pool: &Pool<Postgres>,
    artist_id: &str,
    user_id: &str,
) -> Result<Option<ArtistRow>, Error> {
    // Same junction-table consistency check as get_all_artists: only count artist_tracks rows
    // where the track's album_artist actually matches this artist's name, otherwise polluted
    // junction entries let strangers' artists pass.
    let row: Option<ArtistRow> = sqlx::query_as(
        r#"
        SELECT artists.xata_id, artists.name, artists.picture, artists.xata_createdat
        FROM artists
        WHERE artists.xata_id = $1
          AND EXISTS (
              SELECT 1 FROM artist_tracks atk
              JOIN tracks tr ON tr.xata_id = atk.track_id
                            AND tr.album_artist = artists.name
              JOIN user_uploads uu ON uu.track_id = atk.track_id
              WHERE atk.artist_id = artists.xata_id AND uu.user_id = $2
          )
        "#,
    )
    .bind(artist_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub async fn search_artists(
    pool: &Pool<Postgres>,
    user_id: &str,
    query: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<ArtistWithStats>, Error> {
    let pattern = format!("%{}%", query);
    // Same shape as get_all_artists — see MINE_ARTISTS_CTE for why it is built
    // this way and why the junction guard has to stay.
    let rows: Vec<ArtistWithStats> = sqlx::query_as(&format!(
        r#"
        {MINE_ARTISTS_CTE}
        SELECT
            artists.xata_id,
            artists.name,
            artists.picture,
            COALESCE(ac.album_count, 0) AS album_count
        FROM mine_artists ma
        JOIN artists ON artists.xata_id = ma.artist_id
        LEFT JOIN album_counts ac ON ac.artist_id = ma.artist_id
        WHERE LOWER(artists.name) LIKE LOWER($2)
        ORDER BY artists.name ASC, artists.xata_id ASC
        LIMIT $3 OFFSET $4
        "#
    ))
    .bind(user_id)
    .bind(&pattern)
    .bind(count)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Fetch artists matching names returned by Typesense.
pub async fn get_artists_by_names(
    pool: &Pool<Postgres>,
    user_id: &str,
    names: &[String],
) -> Result<Vec<ArtistWithStats>, Error> {
    if names.is_empty() {
        return Ok(vec![]);
    }
    let name_strs: Vec<&str> = names.iter().map(|s| s.as_str()).collect();
    let rows: Vec<ArtistWithStats> = sqlx::query_as(
        r#"
        SELECT
            artists.xata_id,
            artists.name,
            artists.picture,
            (
                SELECT COUNT(DISTINCT alb.xata_id)
                FROM albums alb
                JOIN artist_albums aa  ON alb.xata_id   = aa.album_id
                JOIN album_tracks  atr ON alb.xata_id   = atr.album_id
                JOIN tracks        tr  ON atr.track_id  = tr.xata_id
                                      AND tr.album       = alb.title
                                      AND tr.album_artist = alb.artist
                JOIN user_uploads  uu  ON tr.xata_id    = uu.track_id
                WHERE aa.artist_id = artists.xata_id
                  AND uu.user_id   = $1
            ) AS album_count
        FROM artists
        JOIN artist_tracks ON artists.xata_id = artist_tracks.artist_id
        JOIN tracks        ON artist_tracks.track_id = tracks.xata_id
                          AND tracks.album_artist = artists.name
        JOIN user_uploads  ON tracks.xata_id = user_uploads.track_id
        WHERE user_uploads.user_id = $1
          AND artists.name = ANY($2)
        GROUP BY artists.xata_id, artists.name, artists.picture
        ORDER BY artists.name ASC, artists.xata_id ASC
        "#,
    )
    .bind(user_id)
    .bind(&name_strs[..])
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_picture_by_artist_id(
    pool: &Pool<Postgres>,
    artist_id: &str,
) -> Result<Option<String>, Error> {
    let row: Option<(Option<String>,)> =
        sqlx::query_as(r#"SELECT picture FROM artists WHERE xata_id = $1"#)
            .bind(artist_id)
            .fetch_optional(pool)
            .await?;

    Ok(row.and_then(|(p,)| p))
}
