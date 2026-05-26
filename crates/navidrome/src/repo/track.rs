use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::track::TrackWithUpload;

const TRACK_SELECT: &str = r#"
    SELECT
        tracks.xata_id,
        tracks.title,
        tracks.artist,
        tracks.album_artist,
        tracks.album_art,
        tracks.album,
        tracks.track_number,
        tracks.disc_number,
        tracks.duration,
        tracks.mb_id,
        tracks.genre,
        tracks.xata_createdat,
        user_uploads.r2_key,
        user_uploads.mime_type,
        user_uploads.file_size,
        (SELECT at2.album_id FROM album_tracks at2
         JOIN albums a ON at2.album_id = a.xata_id
         WHERE at2.track_id = tracks.xata_id
           AND tracks.album = a.title
           AND tracks.album_artist = a.artist
         LIMIT 1) AS album_id,
        (SELECT at3.artist_id FROM artist_tracks at3
         JOIN artists ar ON at3.artist_id = ar.xata_id
         WHERE at3.track_id = tracks.xata_id
           AND tracks.album_artist = ar.name
         LIMIT 1) AS artist_id
    FROM tracks
    JOIN user_uploads ON tracks.xata_id = user_uploads.track_id
"#;

pub async fn get_tracks_by_album(
    pool: &Pool<Postgres>,
    album_id: &str,
    user_id: &str,
) -> Result<Vec<TrackWithUpload>, Error> {
    let rows: Vec<TrackWithUpload> = sqlx::query_as(&format!(
        r#"
        {}
        JOIN album_tracks ON tracks.xata_id = album_tracks.track_id
        JOIN albums ON album_tracks.album_id = albums.xata_id
                    AND tracks.album = albums.title
                    AND tracks.album_artist = albums.artist
        WHERE album_tracks.album_id = $1
          AND user_uploads.user_id = $2
        ORDER BY tracks.disc_number ASC NULLS FIRST, tracks.track_number ASC NULLS FIRST
        "#,
        TRACK_SELECT
    ))
    .bind(album_id)
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_track_by_id(
    pool: &Pool<Postgres>,
    track_id: &str,
    user_id: &str,
) -> Result<Option<TrackWithUpload>, Error> {
    let row: Option<TrackWithUpload> = sqlx::query_as(&format!(
        r#"
        {}
        WHERE tracks.xata_id = $1
          AND user_uploads.user_id = $2
        "#,
        TRACK_SELECT
    ))
    .bind(track_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub async fn get_random_songs(
    pool: &Pool<Postgres>,
    user_id: &str,
    count: i64,
    genre: Option<&str>,
    from_year: Option<i32>,
    to_year: Option<i32>,
) -> Result<Vec<TrackWithUpload>, Error> {
    let mut filters = vec!["user_uploads.user_id = $1".to_string()];

    if let Some(g) = genre {
        filters.push(format!(
            "LOWER(tracks.genre) = LOWER('{}')",
            g.replace('\'', "''")
        ));
    }
    if let Some(from) = from_year {
        if let Some(to) = to_year {
            filters.push(format!(
                "EXTRACT(YEAR FROM tracks.xata_createdat) BETWEEN {} AND {}",
                from.min(to),
                from.max(to)
            ));
        }
    }

    let where_clause = filters.join(" AND ");

    let sql = format!(
        r#"
        {}
        WHERE {}
        ORDER BY RANDOM()
        LIMIT $2
        "#,
        TRACK_SELECT, where_clause
    );

    let rows: Vec<TrackWithUpload> = sqlx::query_as(&sql)
        .bind(user_id)
        .bind(count)
        .fetch_all(pool)
        .await?;

    Ok(rows)
}

pub async fn search_tracks(
    pool: &Pool<Postgres>,
    user_id: &str,
    query: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<TrackWithUpload>, Error> {
    let pattern = format!("%{}%", query);
    let rows: Vec<TrackWithUpload> = sqlx::query_as(&format!(
        r#"
        {}
        WHERE user_uploads.user_id = $1
          AND LOWER(tracks.title) LIKE LOWER($2)
        ORDER BY tracks.title ASC
        LIMIT $3 OFFSET $4
        "#,
        TRACK_SELECT
    ))
    .bind(user_id)
    .bind(&pattern)
    .bind(count)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_tracks_by_ids(
    pool: &Pool<Postgres>,
    ids: &[String],
    user_id: &str,
) -> Result<Vec<TrackWithUpload>, Error> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let rows: Vec<TrackWithUpload> = sqlx::query_as(&format!(
        r#"
        {}
        WHERE tracks.xata_id = ANY($1)
          AND user_uploads.user_id = $2
        "#,
        TRACK_SELECT
    ))
    .bind(ids)
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    // Preserve the order Typesense returned.
    let mut map: std::collections::HashMap<String, TrackWithUpload> =
        rows.into_iter().map(|t| (t.xata_id.clone(), t)).collect();
    Ok(ids.iter().filter_map(|id| map.remove(id)).collect())
}

pub async fn get_album_art_by_track_id(
    pool: &Pool<Postgres>,
    track_id: &str,
) -> Result<Option<String>, Error> {
    let row: Option<(Option<String>,)> =
        sqlx::query_as(r#"SELECT album_art FROM tracks WHERE xata_id = $1"#)
            .bind(track_id)
            .fetch_optional(pool)
            .await?;

    Ok(row.and_then(|(art,)| art))
}

pub async fn get_album_id_for_track(
    pool: &Pool<Postgres>,
    track_id: &str,
) -> Result<Option<String>, Error> {
    let row: Option<(String,)> = sqlx::query_as(
        r#"SELECT at2.album_id FROM album_tracks at2
           JOIN albums a ON at2.album_id = a.xata_id
           JOIN tracks t ON at2.track_id = t.xata_id
           WHERE at2.track_id = $1
             AND t.album = a.title
             AND t.album_artist = a.artist
           LIMIT 1"#,
    )
    .bind(track_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id,)| id))
}

pub async fn get_artist_id_for_track(
    pool: &Pool<Postgres>,
    track_id: &str,
) -> Result<Option<String>, Error> {
    let row: Option<(String,)> = sqlx::query_as(
        r#"SELECT at3.artist_id FROM artist_tracks at3
           JOIN artists ar ON at3.artist_id = ar.xata_id
           JOIN tracks t ON at3.track_id = t.xata_id
           WHERE at3.track_id = $1
             AND t.album_artist = ar.name
           LIMIT 1"#,
    )
    .bind(track_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id,)| id))
}
