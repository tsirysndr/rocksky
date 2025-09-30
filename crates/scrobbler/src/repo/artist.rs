use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::artist::Artist;

pub async fn get_artist_by_track_id(
    pool: &Pool<Postgres>,
    track_id: &str,
) -> Result<Artist, Error> {
    let results: Vec<Artist> = sqlx::query_as(
        r#"
    SELECT * FROM artists
    LEFT JOIN artist_tracks ON artists.xata_id = artist_tracks.artist_id
    WHERE artist_tracks.track_id = $1
    "#,
    )
    .bind(track_id)
    .fetch_all(pool)
    .await?;

    Ok(results[0].clone())
}

pub async fn get_artist_by_uri(pool: &Pool<Postgres>, uri: &str) -> Result<Artist, Error> {
    let results: Vec<Artist> = sqlx::query_as(
        r#"
    SELECT * FROM artists
    WHERE artists.uri = $1
    "#,
    )
    .bind(uri)
    .fetch_all(pool)
    .await?;

    Ok(results[0].clone())
}
