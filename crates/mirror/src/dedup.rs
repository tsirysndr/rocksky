//! ±120 second dedup against the `scrobbles` table.
//!
//! We don't want to mirror a play the user already has from another source —
//! e.g. a Spotify play that the spotify crate already scrobbled, then Last.fm
//! reports the same play 30 seconds later.

use anyhow::Error;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};
use tracing::info;

const WINDOW_SECS: i64 = 120;

/// Returns true when an existing scrobble matches (user, title, artist) within
/// ±120s of `at`. Title and artist are compared case-insensitively against the
/// denormalized columns on the `tracks` table.
pub async fn already_scrobbled(
    pool: &Pool<Postgres>,
    user_id: &str,
    title: &str,
    artist: &str,
    at: DateTime<Utc>,
) -> Result<bool, Error> {
    // `scrobbles.timestamp` is Postgres TIMESTAMP (no zone), so we must bind
    // NaiveDateTime, not DateTime<Utc> (which sqlx encodes as TIMESTAMPTZ).
    let lo = (at - chrono::Duration::seconds(WINDOW_SECS)).naive_utc();
    let hi = (at + chrono::Duration::seconds(WINDOW_SECS)).naive_utc();

    let row: Option<(i32,)> = sqlx::query_as(
        r#"
        SELECT 1
        FROM scrobbles s
        JOIN tracks t ON t.xata_id = s.track_id
        WHERE s.user_id = $1
          AND lower(t.title) = lower($2)
          AND lower(t.artist) = lower($3)
          AND s.timestamp BETWEEN $4 AND $5
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(title)
    .bind(artist)
    .bind(lo)
    .bind(hi)
    .fetch_optional(pool)
    .await?;

    let hit = row.is_some();
    if hit {
        // Always trace at info level when we skip a track — it's the most
        // useful operational signal for confirming the mirror isn't
        // double-scrobbling.
        info!(
            user_id = %user_id,
            title = %title,
            artist = %artist,
            at = %at.to_rfc3339(),
            window_secs = WINDOW_SECS,
            "dedup: skipped — already scrobbled within window"
        );
    } else {
        // …and at info level when we *accept* a track, so every dedup
        // decision is traceable at the same log level.
        info!(
            user_id = %user_id,
            title = %title,
            artist = %artist,
            at = %at.to_rfc3339(),
            "dedup: accepted — no prior scrobble within window"
        );
    }
    Ok(hit)
}
