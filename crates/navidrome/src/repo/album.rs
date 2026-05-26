use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::album::AlbumWithStats;

pub async fn get_albums_by_artist(
    pool: &Pool<Postgres>,
    artist_id: &str,
    user_id: &str,
) -> Result<Vec<AlbumWithStats>, Error> {
    let rows: Vec<AlbumWithStats> = sqlx::query_as(
        r#"
        SELECT
            albums.xata_id,
            albums.title,
            albums.artist,
            albums.year,
            albums.album_art,
            COUNT(DISTINCT album_tracks.track_id) AS song_count,
            SUM(tracks.duration)::bigint AS total_duration,
            MIN(user_uploads.uploaded_at)::timestamptz AS created_at,
            $2::text AS artist_id
        FROM albums
        JOIN artist_albums ON albums.xata_id = artist_albums.album_id
        JOIN album_tracks ON albums.xata_id = album_tracks.album_id
        JOIN tracks ON album_tracks.track_id = tracks.xata_id
                    AND tracks.album = albums.title
                    AND tracks.album_artist = albums.artist
        JOIN user_uploads ON tracks.xata_id = user_uploads.track_id
        WHERE artist_albums.artist_id = $2
          AND user_uploads.user_id = $1
        GROUP BY albums.xata_id, albums.title, albums.artist, albums.year, albums.album_art
        ORDER BY albums.year DESC NULLS LAST
        "#,
    )
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
    let row: Option<AlbumWithStats> = sqlx::query_as(
        r#"
        SELECT
            albums.xata_id,
            albums.title,
            albums.artist,
            albums.year,
            albums.album_art,
            COUNT(DISTINCT album_tracks.track_id) AS song_count,
            SUM(tracks.duration)::bigint AS total_duration,
            MIN(user_uploads.uploaded_at)::timestamptz AS created_at,
            (SELECT aa.artist_id FROM artist_albums aa WHERE aa.album_id = albums.xata_id LIMIT 1) AS artist_id
        FROM albums
        JOIN album_tracks ON albums.xata_id = album_tracks.album_id
        JOIN tracks ON album_tracks.track_id = tracks.xata_id
                    AND tracks.album = albums.title
                    AND tracks.album_artist = albums.artist
        JOIN user_uploads ON tracks.xata_id = user_uploads.track_id
        WHERE user_uploads.user_id = $1
          AND albums.xata_id = $2
        GROUP BY albums.xata_id, albums.title, albums.artist, albums.year, albums.album_art
        "#,
    )
    .bind(user_id)
    .bind(album_id)
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
    let order_clause = match list_type {
        "newest" => "ORDER BY created_at DESC NULLS LAST",
        "alphabeticalByName" => "ORDER BY albums.title ASC",
        "alphabeticalByArtist" => "ORDER BY albums.artist ASC",
        "random" => "ORDER BY RANDOM()",
        "recent" => "ORDER BY created_at DESC NULLS LAST",
        "byYear" => {
            if from_year.unwrap_or(0) > to_year.unwrap_or(9999) {
                "ORDER BY albums.year DESC NULLS LAST"
            } else {
                "ORDER BY albums.year ASC NULLS LAST"
            }
        }
        _ => "ORDER BY created_at DESC NULLS LAST",
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

    // byGenre needs an extra join through artist_albums → artists to check genres array
    let (genre_join, genre_filter) = if list_type == "byGenre" {
        if let Some(_g) = genre {
            (
                "JOIN artist_albums ag ON albums.xata_id = ag.album_id JOIN artists ON ag.artist_id = artists.xata_id".to_string(),
                format!(" AND $4::text = ANY(artists.genres)"),
            )
        } else {
            (String::new(), String::new())
        }
    } else {
        (String::new(), String::new())
    };

    let sql = format!(
        r#"
        SELECT
            albums.xata_id,
            albums.title,
            albums.artist,
            albums.year,
            albums.album_art,
            COUNT(DISTINCT album_tracks.track_id) AS song_count,
            SUM(tracks.duration)::bigint AS total_duration,
            MIN(user_uploads.uploaded_at)::timestamptz AS created_at,
            (SELECT aa.artist_id FROM artist_albums aa WHERE aa.album_id = albums.xata_id LIMIT 1) AS artist_id
        FROM albums
        JOIN album_tracks ON albums.xata_id = album_tracks.album_id
        JOIN tracks ON album_tracks.track_id = tracks.xata_id
                    AND tracks.album = albums.title
                    AND tracks.album_artist = albums.artist
        JOIN user_uploads ON tracks.xata_id = user_uploads.track_id
        {}
        WHERE user_uploads.user_id = $1
        {}{}
        GROUP BY albums.xata_id, albums.title, albums.artist, albums.year, albums.album_art
        {}
        LIMIT $2 OFFSET $3
        "#,
        genre_join, year_filter, genre_filter, order_clause
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
    let rows: Vec<AlbumWithStats> = sqlx::query_as(
        r#"
        SELECT
            albums.xata_id,
            albums.title,
            albums.artist,
            albums.year,
            albums.album_art,
            COUNT(DISTINCT album_tracks.track_id) AS song_count,
            SUM(tracks.duration)::bigint AS total_duration,
            MIN(user_uploads.uploaded_at)::timestamptz AS created_at,
            (SELECT aa.artist_id FROM artist_albums aa WHERE aa.album_id = albums.xata_id LIMIT 1) AS artist_id
        FROM albums
        JOIN album_tracks ON albums.xata_id = album_tracks.album_id
        JOIN tracks ON album_tracks.track_id = tracks.xata_id
                    AND tracks.album = albums.title
                    AND tracks.album_artist = albums.artist
        JOIN user_uploads ON tracks.xata_id = user_uploads.track_id
        WHERE user_uploads.user_id = $1
          AND LOWER(albums.title) LIKE LOWER($2)
        GROUP BY albums.xata_id, albums.title, albums.artist, albums.year, albums.album_art
        ORDER BY albums.title ASC
        LIMIT $3 OFFSET $4
        "#,
    )
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
    let rows: Vec<AlbumWithStats> = sqlx::query_as(
        r#"
        SELECT
            albums.xata_id,
            albums.title,
            albums.artist,
            albums.year,
            albums.album_art,
            COUNT(DISTINCT album_tracks.track_id) AS song_count,
            SUM(tracks.duration)::bigint AS total_duration,
            MIN(user_uploads.uploaded_at)::timestamptz AS created_at,
            (SELECT aa.artist_id FROM artist_albums aa WHERE aa.album_id = albums.xata_id LIMIT 1) AS artist_id
        FROM albums
        JOIN album_tracks ON albums.xata_id = album_tracks.album_id
        JOIN tracks ON album_tracks.track_id = tracks.xata_id
                    AND tracks.album = albums.title
                    AND tracks.album_artist = albums.artist
        JOIN user_uploads ON tracks.xata_id = user_uploads.track_id
        WHERE user_uploads.user_id = $1
          AND albums.title = ANY($2)
          AND albums.artist = ANY($3)
        GROUP BY albums.xata_id, albums.title, albums.artist, albums.year, albums.album_art
        ORDER BY albums.title ASC
        "#,
    )
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
