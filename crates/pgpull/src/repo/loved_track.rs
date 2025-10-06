use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::loved_track::LovedTrack;

pub async fn get_loved_tracks(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<LovedTrack>, Error> {
    let loved_tracks =
        sqlx::query_as::<_, LovedTrack>("SELECT * FROM loved_tracks OFFSET $1 LIMIT $2")
            .bind(offset)
            .bind(limit)
            .fetch_all(pool)
            .await?;
    Ok(loved_tracks)
}

pub async fn insert_loved_track(
    pool: &Pool<Postgres>,
    loved_track: &LovedTrack,
) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO loved_tracks (
            xata_id,
            user_id,
            track_id,
            xata_createdat
        ) VALUES ($1, $2, $3, $4)
          ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&loved_track.xata_id)
    .bind(&loved_track.user_id)
    .bind(&loved_track.track_id)
    .bind(loved_track.xata_createdat)
    .execute(pool)
    .await?;
    Ok(())
}
