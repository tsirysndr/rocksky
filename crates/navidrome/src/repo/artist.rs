use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::artist::{ArtistRow, ArtistWithStats};

pub async fn get_all_artists(
    pool: &Pool<Postgres>,
    user_id: &str,
) -> Result<Vec<ArtistWithStats>, Error> {
    let rows: Vec<ArtistWithStats> = sqlx::query_as(
        r#"
        SELECT
            artists.xata_id,
            artists.name,
            artists.picture,
            COUNT(DISTINCT artist_albums.album_id) AS album_count
        FROM artists
        JOIN artist_tracks ON artists.xata_id = artist_tracks.artist_id
        JOIN user_uploads ON artist_tracks.track_id = user_uploads.track_id
        LEFT JOIN artist_albums ON artists.xata_id = artist_albums.artist_id
        WHERE user_uploads.user_id = $1
        GROUP BY artists.xata_id, artists.name, artists.picture
        ORDER BY artists.name ASC
        "#,
    )
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
    let row: Option<ArtistRow> = sqlx::query_as(
        r#"
        SELECT DISTINCT artists.xata_id, artists.name, artists.picture, artists.xata_createdat
        FROM artists
        JOIN artist_tracks ON artists.xata_id = artist_tracks.artist_id
        JOIN user_uploads ON artist_tracks.track_id = user_uploads.track_id
        WHERE artists.xata_id = $1 AND user_uploads.user_id = $2
        LIMIT 1
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
    let rows: Vec<ArtistWithStats> = sqlx::query_as(
        r#"
        SELECT
            artists.xata_id,
            artists.name,
            artists.picture,
            COUNT(DISTINCT artist_albums.album_id) AS album_count
        FROM artists
        JOIN artist_tracks ON artists.xata_id = artist_tracks.artist_id
        JOIN user_uploads ON artist_tracks.track_id = user_uploads.track_id
        LEFT JOIN artist_albums ON artists.xata_id = artist_albums.artist_id
        WHERE user_uploads.user_id = $1
          AND LOWER(artists.name) LIKE LOWER($2)
        GROUP BY artists.xata_id, artists.name, artists.picture
        ORDER BY artists.name ASC
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
            COUNT(DISTINCT artist_albums.album_id) AS album_count
        FROM artists
        JOIN artist_tracks ON artists.xata_id = artist_tracks.artist_id
        JOIN user_uploads ON artist_tracks.track_id = user_uploads.track_id
        LEFT JOIN artist_albums ON artists.xata_id = artist_albums.artist_id
        WHERE user_uploads.user_id = $1
          AND artists.name = ANY($2)
        GROUP BY artists.xata_id, artists.name, artists.picture
        ORDER BY artists.name ASC
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
