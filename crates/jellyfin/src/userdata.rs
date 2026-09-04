//! Per-user, per-item playback state.
//!
//! `IsFavorite` is not stored here — it maps onto `loved_tracks`, the same
//! table the Subsonic service stars into and the same one that drives the
//! ATProto like record. What is left (play count, played flag, resume
//! position, thumb rating) has no home in the Rocksky schema, so it lives in a
//! sidecar keyed by (user, native id).

use anyhow::Error;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};

#[derive(Debug, Default, Clone, sqlx::FromRow)]
pub struct ItemUserData {
    pub playback_position_ticks: i64,
    pub play_count: i32,
    pub played: bool,
    pub likes: Option<bool>,
    pub rating: Option<f64>,
    pub last_played_date: Option<DateTime<Utc>>,
}

pub async fn ensure_table(pool: &Pool<Postgres>) -> Result<(), Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS jellyfin_user_item_data (
            user_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            playback_position_ticks BIGINT NOT NULL DEFAULT 0,
            play_count INTEGER NOT NULL DEFAULT 0,
            played BOOLEAN NOT NULL DEFAULT FALSE,
            likes BOOLEAN,
            rating DOUBLE PRECISION,
            last_played_date TIMESTAMPTZ,
            PRIMARY KEY (user_id, item_id)
        )
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get(pool: &Pool<Postgres>, user_id: &str, item_id: &str) -> ItemUserData {
    sqlx::query_as(
        r#"
        SELECT playback_position_ticks, play_count, played, likes, rating, last_played_date
        FROM jellyfin_user_item_data
        WHERE user_id = $1 AND item_id = $2
        "#,
    )
    .bind(user_id)
    .bind(item_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None)
    .unwrap_or_default()
}

/// Fetch a whole page's worth in one query. A listing otherwise costs one round
/// trip per row before any JSON is written.
pub async fn get_many(
    pool: &Pool<Postgres>,
    user_id: &str,
    item_ids: &[String],
) -> std::collections::HashMap<String, ItemUserData> {
    if item_ids.is_empty() {
        return Default::default();
    }
    let rows: Vec<(String, i64, i32, bool, Option<bool>, Option<f64>, Option<DateTime<Utc>>)> =
        sqlx::query_as(
            r#"
            SELECT item_id, playback_position_ticks, play_count, played, likes, rating, last_played_date
            FROM jellyfin_user_item_data
            WHERE user_id = $1 AND item_id = ANY($2)
            "#,
        )
        .bind(user_id)
        .bind(item_ids)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    rows.into_iter()
        .map(|(id, ticks, count, played, likes, rating, last)| {
            (
                id,
                ItemUserData {
                    playback_position_ticks: ticks,
                    play_count: count,
                    played,
                    likes,
                    rating,
                    last_played_date: last,
                },
            )
        })
        .collect()
}

/// Items the user stopped part-way through and hasn't since finished — the
/// "continue listening" rail. Most recently played first.
pub async fn resume_items(pool: &Pool<Postgres>, user_id: &str, limit: i64) -> Vec<String> {
    let rows: Vec<(String,)> = sqlx::query_as(
        r#"
        SELECT item_id
        FROM jellyfin_user_item_data
        WHERE user_id = $1
          AND playback_position_ticks > 0
          AND played = FALSE
        ORDER BY last_played_date DESC NULLS LAST, item_id ASC
        LIMIT $2
        "#,
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    rows.into_iter().map(|(id,)| id).collect()
}

/// Which of `item_ids` the user has starred. One query for a whole page.
pub async fn favorites_among(
    pool: &Pool<Postgres>,
    user_id: &str,
    track_ids: &[String],
) -> std::collections::HashSet<String> {
    if track_ids.is_empty() {
        return Default::default();
    }
    let rows: Vec<(String,)> = sqlx::query_as(
        r#"SELECT track_id FROM loved_tracks WHERE user_id = $1 AND track_id = ANY($2)"#,
    )
    .bind(user_id)
    .bind(track_ids)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    rows.into_iter().map(|(id,)| id).collect()
}

pub async fn set_position(
    pool: &Pool<Postgres>,
    user_id: &str,
    item_id: &str,
    ticks: i64,
) -> Result<(), Error> {
    upsert(pool, user_id, item_id, "playback_position_ticks", ticks).await
}

pub async fn set_played(
    pool: &Pool<Postgres>,
    user_id: &str,
    item_id: &str,
    played: bool,
    at: Option<DateTime<Utc>>,
) -> Result<(), Error> {
    // Marking played bumps the count and stamps the date; un-marking clears
    // both, which is what the reference server does for `DELETE
    // /UserPlayedItems/{id}`.
    if played {
        sqlx::query(
            r#"
            INSERT INTO jellyfin_user_item_data (user_id, item_id, played, play_count, last_played_date)
            VALUES ($1, $2, TRUE, 1, COALESCE($3, NOW()))
            ON CONFLICT (user_id, item_id) DO UPDATE SET
                played = TRUE,
                play_count = jellyfin_user_item_data.play_count + 1,
                last_played_date = COALESCE($3, NOW())
            "#,
        )
        .bind(user_id)
        .bind(item_id)
        .bind(at)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO jellyfin_user_item_data (user_id, item_id, played, play_count, last_played_date)
            VALUES ($1, $2, FALSE, 0, NULL)
            ON CONFLICT (user_id, item_id) DO UPDATE SET
                played = FALSE,
                play_count = 0,
                last_played_date = NULL
            "#,
        )
        .bind(user_id)
        .bind(item_id)
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub async fn set_likes(
    pool: &Pool<Postgres>,
    user_id: &str,
    item_id: &str,
    likes: Option<bool>,
) -> Result<(), Error> {
    upsert(pool, user_id, item_id, "likes", likes).await
}

pub async fn set_play_count(
    pool: &Pool<Postgres>,
    user_id: &str,
    item_id: &str,
    count: i32,
) -> Result<(), Error> {
    upsert(pool, user_id, item_id, "play_count", count).await
}

pub async fn set_rating(
    pool: &Pool<Postgres>,
    user_id: &str,
    item_id: &str,
    rating: Option<f64>,
) -> Result<(), Error> {
    upsert(pool, user_id, item_id, "rating", rating).await
}

pub async fn set_played_flag(
    pool: &Pool<Postgres>,
    user_id: &str,
    item_id: &str,
    played: bool,
) -> Result<(), Error> {
    upsert(pool, user_id, item_id, "played", played).await
}

pub async fn set_last_played(
    pool: &Pool<Postgres>,
    user_id: &str,
    item_id: &str,
    at: Option<DateTime<Utc>>,
) -> Result<(), Error> {
    upsert(pool, user_id, item_id, "last_played_date", at).await
}

/// Upsert one column. `column` is always a literal from this module — never
/// anything a client sent.
async fn upsert<T>(
    pool: &Pool<Postgres>,
    user_id: &str,
    item_id: &str,
    column: &str,
    value: T,
) -> Result<(), Error>
where
    T: for<'q> sqlx::Encode<'q, Postgres> + sqlx::Type<Postgres> + Send + 'static,
{
    let sql = format!(
        r#"
        INSERT INTO jellyfin_user_item_data (user_id, item_id, {column})
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, item_id) DO UPDATE SET {column} = EXCLUDED.{column}
        "#
    );
    sqlx::query(&sql)
        .bind(user_id)
        .bind(item_id)
        .bind(value)
        .execute(pool)
        .await?;
    Ok(())
}
