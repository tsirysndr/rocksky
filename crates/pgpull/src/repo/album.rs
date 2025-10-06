use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::album::Album;

pub async fn get_albums(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<Album>, Error> {
    let albums: Vec<Album> = sqlx::query_as("SELECT * FROM albums OFFSET $1 LIMIT $2")
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await?;
    Ok(albums)
}

pub async fn insert_album(pool: &Pool<Postgres>, album: &Album) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO albums (
        xata_id,
        title,
        artist,
        release_date,
        album_art,
        year,
        spotify_link,
        tidal_link,
        youtube_link,
        apple_music_link,
        sha256,
        uri,
        artist_uri,
        xata_createdat
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&album.xata_id)
    .bind(&album.title)
    .bind(&album.artist)
    .bind(&album.release_date)
    .bind(&album.album_art)
    .bind(album.year)
    .bind(&album.spotify_link)
    .bind(&album.tidal_link)
    .bind(&album.youtube_link)
    .bind(&album.apple_music_link)
    .bind(&album.sha256)
    .bind(&album.uri)
    .bind(&album.artist_uri)
    .bind(album.xata_createdat)
    .execute(pool)
    .await?;

    Ok(())
}
