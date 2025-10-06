use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::scrobble::Scrobble;

pub async fn get_scrobbles(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<Scrobble>, Error> {
    let scrobbles = sqlx::query_as::<_, Scrobble>("SELECT * FROM scrobbles OFFSET $1 LIMIT $2")
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await?;
    Ok(scrobbles)
}

pub async fn insert_scrobble(pool: &Pool<Postgres>, scrobble: &Scrobble) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO scrobbles (
            xata_id,
            user_id,
            track_id,
            album_id,
            artist_id,
            uri,
            xata_createdat,
            timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&scrobble.xata_id)
    .bind(&scrobble.user_id)
    .bind(&scrobble.track_id)
    .bind(&scrobble.album_id)
    .bind(&scrobble.artist_id)
    .bind(&scrobble.uri)
    .bind(scrobble.xata_createdat)
    .bind(scrobble.timestamp)
    .execute(pool)
    .await?;
    Ok(())
}
