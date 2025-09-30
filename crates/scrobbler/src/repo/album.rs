use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::album::Album;

pub async fn get_album_by_track_id(pool: &Pool<Postgres>, track_id: &str) -> Result<Album, Error> {
    let results: Vec<Album> = sqlx::query_as(
        r#"
    SELECT * FROM albums
    LEFT JOIN album_tracks ON albums.xata_id = album_tracks.album_id
    WHERE album_tracks.track_id = $1
    "#,
    )
    .bind(track_id)
    .fetch_all(pool)
    .await?;

    Ok(results[0].clone())
}

pub async fn get_album_by_uri(pool: &Pool<Postgres>, uri: &str) -> Result<Album, Error> {
    let results: Vec<Album> = sqlx::query_as(
        r#"
    SELECT * FROM albums
    WHERE albums.uri = $1
    "#,
    )
    .bind(uri)
    .fetch_all(pool)
    .await?;

    Ok(results[0].clone())
}
