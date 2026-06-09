use anyhow::Error;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};

pub async fn create_scrobble(
    pool: &Pool<Postgres>,
    user_id: &str,
    track_id: &str,
    album_id: Option<&str>,
    artist_id: Option<&str>,
    timestamp: DateTime<Utc>,
) -> Result<(), Error> {
    sqlx::query(
        r#"
        INSERT INTO scrobbles (user_id, track_id, album_id, artist_id, timestamp)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, track_id, timestamp) DO NOTHING
        "#,
    )
    .bind(user_id)
    .bind(track_id)
    .bind(album_id)
    .bind(artist_id)
    .bind(timestamp)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn star_track(pool: &Pool<Postgres>, user_id: &str, track_id: &str) -> Result<(), Error> {
    sqlx::query(
        r#"
        INSERT INTO loved_tracks (user_id, track_id)
        SELECT $1, $2
        WHERE NOT EXISTS (
            SELECT 1 FROM loved_tracks WHERE user_id = $1 AND track_id = $2
        )
        "#,
    )
    .bind(user_id)
    .bind(track_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn unstar_track(
    pool: &Pool<Postgres>,
    user_id: &str,
    track_id: &str,
) -> Result<(), Error> {
    sqlx::query(r#"DELETE FROM loved_tracks WHERE user_id = $1 AND track_id = $2"#)
        .bind(user_id)
        .bind(track_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn is_track_starred(
    pool: &Pool<Postgres>,
    user_id: &str,
    track_id: &str,
) -> Result<bool, Error> {
    let row: Option<(i64,)> =
        sqlx::query_as(r#"SELECT COUNT(*) FROM loved_tracks WHERE user_id = $1 AND track_id = $2"#)
            .bind(user_id)
            .bind(track_id)
            .fetch_optional(pool)
            .await?;

    Ok(row.map_or(false, |(count,)| count > 0))
}
