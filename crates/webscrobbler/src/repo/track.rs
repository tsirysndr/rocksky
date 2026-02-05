use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::track::Track;

pub async fn get_track(
    pool: &Pool<Postgres>,
    title: &str,
    artist: &str,
) -> Result<Option<Track>, Error> {
    let results: Vec<Track> = sqlx::query_as(
        r#"
    SELECT * FROM tracks
    WHERE LOWER(title) = LOWER($1)
    AND (LOWER(artist) = LOWER($2) OR LOWER(album_artist) = LOWER($2)) AND LOWER(album_artist) != 'various artists'
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

pub async fn get_track_by_mbid(pool: &Pool<Postgres>, mbid: &str) -> Result<Option<Track>, Error> {
    let results: Vec<Track> = sqlx::query_as(
        r#"
    SELECT * FROM tracks WHERE mb_id = $1
    "#,
    )
    .bind(mbid)
    .fetch_all(pool)
    .await?;

    if results.len() == 0 {
        return Ok(None);
    }

    Ok(Some(results[0].clone()))
}
