use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::playlist::Playlist;

pub async fn get_playlists(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<Playlist>, Error> {
    let playlists: Vec<Playlist> = sqlx::query_as("SELECT * FROM playlists OFFSET $1 LIMIT $2")
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await?;
    Ok(playlists)
}

pub async fn insert_playlist(pool: &Pool<Postgres>, playlist: &Playlist) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO playlists (
        xata_id,
        name,
        description,
        picture,
        spotify_link,
        tidal_link,
        apple_music_link,
        xata_createdat,
        xata_updatedat,
        uri,
        created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&playlist.xata_id)
    .bind(&playlist.name)
    .bind(&playlist.description)
    .bind(&playlist.picture)
    .bind(&playlist.spotify_link)
    .bind(&playlist.tidal_link)
    .bind(&playlist.apple_music_link)
    .bind(playlist.xata_createdat)
    .bind(playlist.xata_updatedat)
    .bind(&playlist.uri)
    .bind(&playlist.created_by)
    .execute(pool)
    .await?;
    Ok(())
}
