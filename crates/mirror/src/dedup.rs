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

/// Returns true when an existing scrobble matches within ±120s of `at`.
///
/// Three match strategies, OR-ed together inside the time window:
///   1. **Title + artist** (case-insensitive) — handles the common case where
///      Spotify scrobbled "Bohemian Rhapsody" and Last.fm reports the same.
///   2. **MusicBrainz recording ID** — handles cases where the *title* differs
///      slightly between sources ("Song (Remastered)" vs. "Song", different
///      hyphenation, feat-credit punctuation, capitalization beyond what
///      `lower()` normalizes) but the recording is identifiably the same.
///   3. **ISRC** — same intent as MBID but anchored to the recording's ISRC.
///
/// Pass `mb_id`/`isrc = None` if the upstream source didn't supply one.
pub async fn already_scrobbled(
    pool: &Pool<Postgres>,
    user_id: &str,
    title: &str,
    artist: &str,
    mb_id: Option<&str>,
    isrc: Option<&str>,
    at: DateTime<Utc>,
) -> Result<bool, Error> {
    // `scrobbles.timestamp` is Postgres TIMESTAMP (no zone), so we must bind
    // NaiveDateTime, not DateTime<Utc> (which sqlx encodes as TIMESTAMPTZ).
    let lo = (at - chrono::Duration::seconds(WINDOW_SECS)).naive_utc();
    let hi = (at + chrono::Duration::seconds(WINDOW_SECS)).naive_utc();

    // Empty mb_id/isrc strings can leak in from upstream defaulting; treat
    // them as None so we don't accidentally match every null-MBID/ISRC row.
    let mb_id = mb_id.filter(|s| !s.trim().is_empty());
    let isrc = isrc.filter(|s| !s.trim().is_empty());

    let row: Option<(i32,)> = sqlx::query_as(
        r#"
        SELECT 1
        FROM scrobbles s
        JOIN tracks t ON t.xata_id = s.track_id
        WHERE s.user_id = $1
          AND s.timestamp BETWEEN $4 AND $5
          AND (
                (lower(t.title) = lower($2) AND lower(t.artist) = lower($3))
             OR ($6::text IS NOT NULL AND t.mb_id = $6)
             OR ($7::text IS NOT NULL AND t.isrc = $7)
          )
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(title)
    .bind(artist)
    .bind(lo)
    .bind(hi)
    .bind(mb_id)
    .bind(isrc)
    .fetch_optional(pool)
    .await?;

    let hit = row.is_some();
    if hit {
        info!(
            user_id = %user_id,
            title = %title,
            artist = %artist,
            mb_id = mb_id.unwrap_or("-"),
            isrc = isrc.unwrap_or("-"),
            at = %at.to_rfc3339(),
            window_secs = WINDOW_SECS,
            "dedup: skipped — already scrobbled within window"
        );
    } else {
        info!(
            user_id = %user_id,
            title = %title,
            artist = %artist,
            mb_id = mb_id.unwrap_or("-"),
            isrc = isrc.unwrap_or("-"),
            at = %at.to_rfc3339(),
            "dedup: accepted — no prior scrobble within window"
        );
    }
    Ok(hit)
}
