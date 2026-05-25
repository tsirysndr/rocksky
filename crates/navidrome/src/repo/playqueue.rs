use anyhow::Error;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};

pub struct PlayQueue {
    pub user_id: String,
    pub track_ids: Vec<String>,
    pub current_track_id: Option<String>,
    pub position_ms: i64,
    pub changed_at: DateTime<Utc>,
    pub changed_by: String,
}

pub async fn ensure_table(pool: &Pool<Postgres>) -> Result<(), Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS navidrome_play_queues (
            user_id TEXT PRIMARY KEY,
            track_ids TEXT[] NOT NULL DEFAULT '{}',
            current_track_id TEXT,
            position_ms BIGINT NOT NULL DEFAULT 0,
            changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            changed_by TEXT NOT NULL DEFAULT ''
        )
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_play_queue(
    pool: &Pool<Postgres>,
    user_id: &str,
) -> Result<Option<PlayQueue>, Error> {
    let row: Option<(
        String,
        Vec<String>,
        Option<String>,
        i64,
        DateTime<Utc>,
        String,
    )> = sqlx::query_as(
        r#"
            SELECT user_id, track_ids, current_track_id, position_ms, changed_at, changed_by
            FROM navidrome_play_queues
            WHERE user_id = $1
            "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(user_id, track_ids, current_track_id, position_ms, changed_at, changed_by)| PlayQueue {
            user_id,
            track_ids,
            current_track_id,
            position_ms,
            changed_at,
            changed_by,
        },
    ))
}

pub async fn save_play_queue(
    pool: &Pool<Postgres>,
    user_id: &str,
    track_ids: &[String],
    current_track_id: Option<&str>,
    position_ms: i64,
    changed_by: &str,
) -> Result<(), Error> {
    sqlx::query(
        r#"
        INSERT INTO navidrome_play_queues (user_id, track_ids, current_track_id, position_ms, changed_at, changed_by)
        VALUES ($1, $2, $3, $4, NOW(), $5)
        ON CONFLICT (user_id) DO UPDATE SET
            track_ids = EXCLUDED.track_ids,
            current_track_id = EXCLUDED.current_track_id,
            position_ms = EXCLUDED.position_ms,
            changed_at = EXCLUDED.changed_at,
            changed_by = EXCLUDED.changed_by
        "#,
    )
    .bind(user_id)
    .bind(track_ids)
    .bind(current_track_id)
    .bind(position_ms)
    .bind(changed_by)
    .execute(pool)
    .await?;
    Ok(())
}
