use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::artist::Artist;

pub async fn get_artists(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<Artist>, Error> {
    let artists = sqlx::query_as::<_, Artist>("SELECT * FROM artists OFFSET $1 LIMIT $2")
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await?;
    Ok(artists)
}

pub async fn insert_artist(pool: &Pool<Postgres>, artist: &Artist) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO artists (
        xata_id,
        name,
        biography,
        born,
        born_in,
        died,
        picture,
        sha256,
        spotify_link,
        tidal_link,
        youtube_link,
        apple_music_link,
        uri,
        genres,
        xata_createdat
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&artist.xata_id)
    .bind(&artist.name)
    .bind(&artist.biography)
    .bind(&artist.born)
    .bind(&artist.born_in)
    .bind(&artist.died)
    .bind(&artist.picture)
    .bind(&artist.sha256)
    .bind(&artist.spotify_link)
    .bind(&artist.tidal_link)
    .bind(&artist.youtube_link)
    .bind(&artist.apple_music_link)
    .bind(&artist.uri)
    .bind(&artist.genres)
    .bind(artist.xata_createdat)
    .execute(pool)
    .await?;
    Ok(())
}
