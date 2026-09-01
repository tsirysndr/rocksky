use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::album::AlbumWithStats;

/// The caller's albums, with their per-album stats, computed in one pass.
///
/// This walks outward from `user_uploads` rather than inward from `albums`.
/// The catalogue tables are global — every scrobble by every Rocksky user lands
/// in them, so `albums` holds 171k rows and `tracks` 547k — while everyone's
/// uploads put together are 10k rows. The listing used to scan `albums` and
/// evaluate five correlated subqueries per surviving row (song count, duration,
/// created_at, the artist id, and the song count *again* inside the dedup
/// window), then rank every one of them before LIMIT could apply. That is work
/// proportional to the catalogue, not to the library being listed: ~18s for the
/// largest library, and no cheaper for page 1 than for the last page.
///
/// Aggregating the user's uploads once, up front, does the same job in a single
/// GROUP BY and hands the window function a few hundred rows instead of
/// thousands. Byte-identical output, ~0.5s.
///
/// MATERIALIZED is load-bearing: inlined, the planner is free to push these
/// back into the outer query per-row and rebuild the shape this avoids.
///
/// `lower(tr.album) = lower(albums.title) AND lower(tr.album_artist) = lower(albums.artist)` stays on the
/// junction join: album_tracks has polluted entries linking tracks to albums
/// they don't belong to (a different release with the same title from another
/// user, stale links from re-ingestion), and without the guard a single stray
/// row puts a stranger's album in the caller's library. See commit ffcbfc3b.
///
/// The stats must count each position on the record once, and three things each
/// used to multiply them — the grid said 15 songs / 97 min where the album page
/// said 14 / 48. `mine` is DISTINCT ON the track (a user can have several
/// uploads of one track, from re-uploading); the junction lookup is DISTINCT (a
/// track can have several `album_tracks` rows for one album, from re-ingestion);
/// and `album_members` is DISTINCT ON the slot (a re-upload whose tags differ at
/// all hashes to a whole new `tracks` row for the same track number). The slot
/// keeps the oldest track and `mine` the earliest upload, matching what
/// `member_tracks` and `get_tracks_by_album` pick, so the three agree.
const ALBUM_STATS_CTE: &str = r#"
WITH mine AS MATERIALIZED (
    SELECT DISTINCT ON (uu.track_id)
           uu.track_id, uu.uploaded_at, t.album, t.album_artist, t.duration,
           t.disc_number, t.track_number, t.xata_createdat,
           CASE WHEN t.track_number IS NULL THEN t.xata_id ELSE '' END AS unnumbered
    FROM user_uploads uu
    JOIN tracks t ON t.xata_id = uu.track_id
    WHERE uu.user_id = $1
    ORDER BY uu.track_id, uu.uploaded_at ASC, uu.xata_id ASC
),
album_members AS MATERIALIZED (
    SELECT DISTINCT ON (atr.album_id, m.disc_number, m.track_number, m.unnumbered)
           atr.album_id, m.duration, m.uploaded_at
    FROM mine m
    JOIN LATERAL (
        SELECT DISTINCT atr0.album_id
        FROM album_tracks atr0
        WHERE atr0.track_id = m.track_id
    ) atr ON true
    JOIN albums al ON al.xata_id = atr.album_id
                  AND lower(al.title)  = lower(m.album)
                  AND lower(al.artist) = lower(m.album_artist)
    ORDER BY atr.album_id, m.disc_number, m.track_number, m.unnumbered,
             m.xata_createdat ASC, m.track_id ASC
),
album_stats AS MATERIALIZED (
    SELECT album_id,
           COUNT(*)                      AS song_count,
           SUM(duration)::bigint         AS total_duration,
           MIN(uploaded_at)::timestamptz AS created_at
    FROM album_members
    GROUP BY album_id
)
"#;

/// One row per track ON the record, for the header's song count / running time.
///
/// Three things each used to multiply these rows, and `SUM(duration)` reported
/// "I'M REALLY LIKE THAT" as 97 minutes instead of 51: a track can have several
/// `user_uploads` rows for one user (re-uploading), several `album_tracks` rows
/// for one album (re-ingestion), and — when a re-upload's tags differ at all —
/// a whole second `tracks` row for the same position on the record. EXISTS
/// handles the first two; DISTINCT ON the slot handles the third, keeping the
/// oldest row so the header agrees with `get_tracks_by_album`.
///
/// `user_param` is the bind placeholder holding the user id.
fn member_tracks(user_param: &str) -> String {
    format!(
        r#"        JOIN LATERAL (
            SELECT DISTINCT ON (tracks.disc_number, tracks.track_number, unnumbered)
                   tracks.xata_id,
                   tracks.duration,
                   (SELECT MIN(uu.uploaded_at) FROM user_uploads uu
                     WHERE uu.track_id = tracks.xata_id AND uu.user_id = {user_param}) AS uploaded_at
            FROM tracks
            CROSS JOIN LATERAL (
                SELECT CASE WHEN tracks.track_number IS NULL THEN tracks.xata_id ELSE '' END
            ) AS k(unnumbered)
            WHERE lower(tracks.album) = lower(albums.title)
              AND lower(tracks.album_artist) = lower(albums.artist)
              AND EXISTS (SELECT 1 FROM album_tracks atr
                           WHERE atr.album_id = albums.xata_id
                             AND atr.track_id = tracks.xata_id)
              AND EXISTS (SELECT 1 FROM user_uploads uu
                           WHERE uu.track_id = tracks.xata_id AND uu.user_id = {user_param})
            ORDER BY tracks.disc_number, tracks.track_number, unnumbered,
                     tracks.xata_createdat ASC, tracks.xata_id ASC
        ) member ON true"#
    )
}

pub async fn get_albums_by_artist(
    pool: &Pool<Postgres>,
    artist_id: &str,
    user_id: &str,
) -> Result<Vec<AlbumWithStats>, Error> {
    let rows: Vec<AlbumWithStats> = sqlx::query_as(&format!(
        r#"
        SELECT
            albums.xata_id,
            albums.title,
            albums.artist,
            albums.year,
            albums.album_art,
            albums.uri,
            COUNT(*) AS song_count,
            SUM(member.duration)::bigint AS total_duration,
            MIN(member.uploaded_at)::timestamptz AS created_at,
            $2::text AS artist_id
        FROM albums
        JOIN artist_albums ON albums.xata_id = artist_albums.album_id
{member}
        WHERE artist_albums.artist_id = $2
        GROUP BY albums.xata_id, albums.title, albums.artist, albums.year, albums.album_art, albums.uri
        ORDER BY albums.year DESC NULLS LAST, albums.xata_id ASC
        "#,
        member = member_tracks("$1")
    ))
    .bind(user_id)
    .bind(artist_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_album_by_id(
    pool: &Pool<Postgres>,
    album_id: &str,
    user_id: &str,
) -> Result<Option<AlbumWithStats>, Error> {
    let row: Option<AlbumWithStats> = sqlx::query_as(&format!(
        r#"
        SELECT
            albums.xata_id,
            albums.title,
            albums.artist,
            albums.year,
            albums.album_art,
            albums.uri,
            COUNT(*) AS song_count,
            SUM(member.duration)::bigint AS total_duration,
            MIN(member.uploaded_at)::timestamptz AS created_at,
            (SELECT aa.artist_id FROM artist_albums aa WHERE aa.album_id = albums.xata_id LIMIT 1) AS artist_id
        FROM albums
{member}
        WHERE albums.xata_id = $2
        GROUP BY albums.xata_id, albums.title, albums.artist, albums.year, albums.album_art, albums.uri
        "#,
        member = member_tracks("$1")
    ))
    .bind(user_id)
    .bind(album_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

/// Look an album up by the AT-URI of its `app.rocksky.album` record.
///
/// The Navidrome id is local to this server, so anything that has to name an
/// album durably — an NFC tag, a share link, another client's record — carries
/// the record URI instead. `albums.uri` is unique, so this is a point lookup.
pub async fn get_album_by_uri(
    pool: &Pool<Postgres>,
    uri: &str,
    user_id: &str,
) -> Result<Option<AlbumWithStats>, Error> {
    let row: Option<AlbumWithStats> = sqlx::query_as(&format!(
        r#"
        SELECT
            albums.xata_id,
            albums.title,
            albums.artist,
            albums.year,
            albums.album_art,
            albums.uri,
            COUNT(*) AS song_count,
            SUM(member.duration)::bigint AS total_duration,
            MIN(member.uploaded_at)::timestamptz AS created_at,
            (SELECT aa.artist_id FROM artist_albums aa WHERE aa.album_id = albums.xata_id LIMIT 1) AS artist_id
        FROM albums
{member}
        WHERE albums.uri = $2
        GROUP BY albums.xata_id, albums.title, albums.artist, albums.year, albums.album_art, albums.uri
        "#,
        member = member_tracks("$1")
    ))
    .bind(user_id)
    .bind(uri)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub async fn get_album_list(
    pool: &Pool<Postgres>,
    user_id: &str,
    list_type: &str,
    count: i64,
    offset: i64,
    from_year: Option<i32>,
    to_year: Option<i32>,
    genre: Option<&str>,
) -> Result<Vec<AlbumWithStats>, Error> {
    // Every branch ends in xata_id: these paginate with LIMIT/OFFSET, and the
    // sort keys are far from unique. user_uploads.uploaded_at defaults to now(),
    // which is the *transaction* timestamp, so a bulk upload gives every album
    // in it the same created_at. Postgres may then order tied rows differently
    // per query, and OFFSET pages silently overlap and skip — albums the user
    // uploaded never appear at all. "random" is exempt: it has no stable order
    // by definition.
    let order_clause = match list_type {
        "newest" => "ORDER BY created_at DESC NULLS LAST, xata_id ASC",
        "alphabeticalByName" => "ORDER BY title ASC, xata_id ASC",
        "alphabeticalByArtist" => "ORDER BY artist ASC, xata_id ASC",
        "random" => "ORDER BY RANDOM()",
        "recent" => "ORDER BY created_at DESC NULLS LAST, xata_id ASC",
        "byYear" => {
            if from_year.unwrap_or(0) > to_year.unwrap_or(9999) {
                "ORDER BY year DESC NULLS LAST, xata_id ASC"
            } else {
                "ORDER BY year ASC NULLS LAST, xata_id ASC"
            }
        }
        _ => "ORDER BY created_at DESC NULLS LAST, xata_id ASC",
    };

    let year_filter = if list_type == "byYear" {
        let from = from_year.unwrap_or(0);
        let to = to_year.unwrap_or(9999);
        format!(
            " AND albums.year BETWEEN {} AND {}",
            from.min(to),
            from.max(to)
        )
    } else {
        String::new()
    };

    // byGenre filter — apply via EXISTS so we don't need a top-level join
    let genre_filter = if list_type == "byGenre" {
        if genre.is_some() {
            " AND EXISTS (\
                SELECT 1 FROM artist_albums ag \
                JOIN artists ar ON ag.artist_id = ar.xata_id \
                WHERE ag.album_id = albums.xata_id \
                  AND $4::text = ANY(ar.genres)\
              )"
            .to_string()
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    // Ingestion stores album_artist verbatim, so featured-artist tracks
    // ("Clean Bandit, Zara Larsson") create separate albums rows from the
    // canonical album ("Clean Bandit"). Dedup by (title, first comma-separated
    // artist token), keeping the row with the most tracks.
    let sql = format!(
        r#"
        {ALBUM_STATS_CTE}
        SELECT
            xata_id,
            title,
            artist,
            year,
            album_art,
            uri,
            song_count,
            total_duration,
            created_at,
            artist_id
        FROM (
            SELECT
                albums.xata_id,
                albums.title,
                albums.artist,
                albums.year,
                albums.album_art,
                albums.uri,
                s.song_count,
                s.total_duration,
                s.created_at,
                (SELECT aa.artist_id FROM artist_albums aa WHERE aa.album_id = albums.xata_id LIMIT 1) AS artist_id,
                ROW_NUMBER() OVER (
                    PARTITION BY LOWER(albums.title), LOWER(TRIM(SPLIT_PART(albums.artist, ',', 1)))
                    ORDER BY
                        s.song_count DESC,
                        albums.year DESC NULLS LAST,
                        albums.xata_id ASC
                ) AS dedup_rank
            FROM album_stats s
            JOIN albums ON albums.xata_id = s.album_id
            WHERE true
            {year_filter}{genre_filter}
        ) deduped
        WHERE dedup_rank = 1
        {order_clause}
        LIMIT $2 OFFSET $3
        "#
    );

    let mut q = sqlx::query_as::<_, AlbumWithStats>(&sql)
        .bind(user_id) // $1
        .bind(count) // $2
        .bind(offset); // $3
    if list_type == "byGenre" {
        q = q.bind(genre.unwrap_or("")); // $4
    }
    let rows: Vec<AlbumWithStats> = q.fetch_all(pool).await?;

    Ok(rows)
}

pub async fn search_albums(
    pool: &Pool<Postgres>,
    user_id: &str,
    query: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<AlbumWithStats>, Error> {
    let pattern = format!("%{}%", query);
    // Same shape as get_album_list — see ALBUM_STATS_CTE for why it is built
    // this way, why the junction guard has to stay, and what the dedup is for.
    let rows: Vec<AlbumWithStats> = sqlx::query_as(&format!(
        r#"
        {ALBUM_STATS_CTE}
        SELECT
            xata_id,
            title,
            artist,
            year,
            album_art,
            uri,
            song_count,
            total_duration,
            created_at,
            artist_id
        FROM (
            SELECT
                albums.xata_id,
                albums.title,
                albums.artist,
                albums.year,
                albums.album_art,
                albums.uri,
                s.song_count,
                s.total_duration,
                s.created_at,
                (SELECT aa.artist_id FROM artist_albums aa WHERE aa.album_id = albums.xata_id LIMIT 1) AS artist_id,
                ROW_NUMBER() OVER (
                    PARTITION BY LOWER(albums.title), LOWER(TRIM(SPLIT_PART(albums.artist, ',', 1)))
                    ORDER BY
                        s.song_count DESC,
                        albums.year DESC NULLS LAST,
                        albums.xata_id ASC
                ) AS dedup_rank
            FROM album_stats s
            JOIN albums ON albums.xata_id = s.album_id
            WHERE LOWER(albums.title) LIKE LOWER($2)
        ) deduped
        WHERE dedup_rank = 1
        ORDER BY title ASC, xata_id ASC
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

/// Fetch albums matching a list of (title, artist) pairs returned by Typesense.
pub async fn get_albums_by_names(
    pool: &Pool<Postgres>,
    user_id: &str,
    pairs: &[(String, String)],
) -> Result<Vec<AlbumWithStats>, Error> {
    if pairs.is_empty() {
        return Ok(vec![]);
    }
    let titles: Vec<&str> = pairs.iter().map(|(t, _)| t.as_str()).collect();
    let artists: Vec<&str> = pairs.iter().map(|(_, a)| a.as_str()).collect();
    let rows: Vec<AlbumWithStats> = sqlx::query_as(&format!(
        r#"
        SELECT
            albums.xata_id,
            albums.title,
            albums.artist,
            albums.year,
            albums.album_art,
            albums.uri,
            COUNT(*) AS song_count,
            SUM(member.duration)::bigint AS total_duration,
            MIN(member.uploaded_at)::timestamptz AS created_at,
            (SELECT aa.artist_id FROM artist_albums aa WHERE aa.album_id = albums.xata_id LIMIT 1) AS artist_id
        FROM albums
{member}
        WHERE albums.title = ANY($2)
          AND albums.artist = ANY($3)
        GROUP BY albums.xata_id, albums.title, albums.artist, albums.year, albums.album_art, albums.uri
        ORDER BY albums.title ASC, albums.xata_id ASC
        "#,
        member = member_tracks("$1")
    ))
    .bind(user_id)
    .bind(&titles[..])
    .bind(&artists[..])
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_album_art(pool: &Pool<Postgres>, album_id: &str) -> Result<Option<String>, Error> {
    let row: Option<(Option<String>,)> =
        sqlx::query_as(r#"SELECT album_art FROM albums WHERE xata_id = $1"#)
            .bind(album_id)
            .fetch_optional(pool)
            .await?;

    Ok(row.and_then(|(art,)| art))
}
