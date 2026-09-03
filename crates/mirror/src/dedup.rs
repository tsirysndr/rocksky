//! Dedup against the `scrobbles` table.
//!
//! We don't want to mirror a play the user already has from another source —
//! e.g. a Spotify play that the spotify crate already scrobbled, then Last.fm
//! reports the same play 30 seconds later.

use anyhow::Error;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};
use tracing::info;

/// Mirror timestamps are the track *start* time, while the Spotify poller
/// stamps ~40% into the track — so an existing row for the same play always
/// sits *after* `at`. The lower bound only needs to absorb clock skew;
/// anything much earlier is a previous (legitimate) play of the same track.
const PRE_WINDOW_SECS: i64 = 30;

/// Upper bound when the matched track has no known duration.
const FALLBACK_POST_WINDOW_SECS: f64 = 240.0;

/// Returns true when an existing scrobble matches the same play as `at`.
///
/// Time window: `[at - 30s, at + upper]` where `upper` is derived from the
/// matched track's duration — the Spotify poller scrobbles at 40% progress,
/// so the same play's row lands at `at + 0.4×duration` plus a few seconds of
/// pipeline lag. `upper = max(240s, 0.4×duration + 60s)`, capped at
/// `1.2×duration` so a back-to-back repeat of a short track (whose next play
/// starts at `at + duration`) is never swallowed.
///
/// Three match strategies, OR-ed together inside the time window:
///   1. **Title + artist** — titles compared with punctuation stripped
///      ("Strobes Pt. 2" vs "Strobes, Pt. 2", "Song - Remix" vs
///      "Song (Remix)"); artists match on the full string or on the primary
///      artist, since Spotify-sourced tracks store comma-joined credits
///      ("Flume, HWLS, slowthai") while Last.fm reports just "Flume".
///   2. **MusicBrainz recording ID** — same recording, differing metadata.
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
    let at_naive = at.naive_utc();

    // Empty mb_id/isrc strings can leak in from upstream defaulting; treat
    // them as None so we don't accidentally match every null-MBID/ISRC row.
    let mb_id = mb_id.filter(|s| !s.trim().is_empty());
    let isrc = isrc.filter(|s| !s.trim().is_empty());

    // GREATEST/LEAST ignore NULLs, so a NULL or zero duration degrades to the
    // fixed fallback window.
    let row: Option<(i32,)> = sqlx::query_as(
        r#"
        SELECT 1
        FROM scrobbles s
        JOIN tracks t ON t.xata_id = s.track_id
        WHERE s.user_id = $1
          AND s.timestamp >= $4::timestamp - make_interval(secs => $7)
          AND s.timestamp <= $4::timestamp + make_interval(secs =>
                LEAST(
                    GREATEST($8, NULLIF(t.duration, 0) / 1000.0 * 0.4 + 60.0),
                    NULLIF(t.duration, 0) / 1000.0 * 1.2
                ))
          AND (
                (
                  btrim(regexp_replace(lower(t.title), '[^a-z0-9]+', ' ', 'g'))
                    = btrim(regexp_replace(lower($2), '[^a-z0-9]+', ' ', 'g'))
                  AND (
                    lower(btrim(t.artist)) = lower(btrim($3))
                    OR lower(btrim(split_part(t.artist, ',', 1)))
                         = lower(btrim(split_part($3, ',', 1)))
                  )
                )
             OR ($5::text IS NOT NULL AND t.mb_id = $5)
             OR ($6::text IS NOT NULL AND t.isrc = $6)
          )
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(title)
    .bind(artist)
    .bind(at_naive)
    .bind(mb_id)
    .bind(isrc)
    .bind(PRE_WINDOW_SECS as f64)
    .bind(FALLBACK_POST_WINDOW_SECS)
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
