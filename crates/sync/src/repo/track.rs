use crate::xata::track::Track;
use anyhow::Error;
use sqlx::{Pool, Postgres};

pub async fn get_track(
    pool: &Pool<Postgres>,
    title: &str,
    artist: &str,
) -> Result<Option<Track>, Error> {
    let results: Vec<Track> = sqlx::query_as(
        r#"
    SELECT * FROM tracks
    WHERE LOWER(title) = LOWER($1)
    AND (LOWER(artist) = LOWER($2) OR LOWER(album_artist) = LOWER($2))
    "#,
    )
    .bind(title)
    .bind(artist)
    .fetch_all(pool)
    .await?;

    if results.len() == 0 {
        return Ok(None);
    }

    Ok(Some(results[0].clone()))
}

pub async fn update_spotify_metadata(
    pool: &Pool<Postgres>,
    xata_id: &str,
    spotify_id: &str,
    isrc: &str,
) -> Result<(), Error> {
    let result = sqlx::query(
        r#"
    UPDATE tracks
    SET spotify_id = $1, isrc = $2, xata_updatedat = NOW()
    WHERE xata_id = $3
    "#,
    )
    .bind(spotify_id)
    .bind(isrc)
    .bind(xata_id)
    .execute(pool)
    .await?;
    tracing::info!(rows_affected = %result.rows_affected(), "Updated Spotify metadata for track");
    Ok(())
}

pub async fn update_tidal_metadata(
    pool: &Pool<Postgres>,
    xata_id: &str,
    tidal_id: &str,
    tidal_link: &str,
    isrc: &str,
) -> Result<(), Error> {
    let result = sqlx::query(
        r#"
    UPDATE tracks
    SET tidal_id = $1, tidal_link = $2, isrc = $3, xata_updatedat = NOW()
    WHERE xata_id = $4
    "#,
    )
    .bind(tidal_id)
    .bind(tidal_link)
    .bind(isrc)
    .bind(xata_id)
    .execute(pool)
    .await?;

    tracing::info!(rows_affected = %result.rows_affected(), "Updated Tidal metadata for track");

    Ok(())
}

pub async fn update_lastfm_metadata(
    pool: &Pool<Postgres>,
    xata_id: &str,
    lastfm_link: &str,
) -> Result<(), Error> {
    let result = sqlx::query(
        r#"
    UPDATE tracks
    SET lastfm_link = $1, xata_updatedat = NOW()
    WHERE xata_id = $2
    "#,
    )
    .bind(lastfm_link)
    .bind(xata_id)
    .execute(pool)
    .await?;
    tracing::info!(rows_affected = %result.rows_affected(), "Updated Last.fm metadata for track");
    Ok(())
}
