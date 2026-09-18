//! Dedup against the `scrobbles` table.
//!
//! We don't want to mirror a play the user already has from another source —
//! e.g. a Spotify play that the spotify crate already scrobbled, then Last.fm
//! reports the same play 30 seconds later.

use anyhow::Error;
use chrono::{DateTime, Utc};
use rocksky_db::sea_query::{self, Cond, Expr, JoinType, Query, SimpleExpr};
use rocksky_db::{Backend, Dialect};
use tracing::info;

use crate::schema::{Scrobbles, Tracks};

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
    pool: &Backend,
    user_id: &str,
    title: &str,
    artist: &str,
    mb_id: Option<&str>,
    isrc: Option<&str>,
    at: DateTime<Utc>,
) -> Result<bool, Error> {
    // Empty mb_id/isrc strings can leak in from upstream defaulting; treat
    // them as None so we don't accidentally match every null-MBID/ISRC row.
    let mb_id = mb_id.filter(|s| !s.trim().is_empty());
    let isrc = isrc.filter(|s| !s.trim().is_empty());

    let dialect = pool.dialect();

    // The window's lower bound is a fixed 30s of clock skew, so it is computed
    // here rather than in SQL. The upper bound depends on the *matched* row's
    // duration, so it has to be an expression.
    let lower = at - chrono::Duration::seconds(PRE_WINDOW_SECS);

    let stmt = Query::select()
        // `cast_int`, not a bare `1`: on Postgres a literal is `int4` and
        // sqlx refuses to decode that into an `i64`.
        .expr(pool.cast_int(Expr::val(1)))
        .from(Scrobbles::Table)
        .join(
            JoinType::Join,
            Tracks::Table,
            Expr::col((Tracks::Table, Tracks::XataId))
                .equals((Scrobbles::Table, Scrobbles::TrackId)),
        )
        .and_where(Expr::col((Scrobbles::Table, Scrobbles::UserId)).eq(user_id))
        .and_where(
            Expr::col((Scrobbles::Table, Scrobbles::Timestamp))
                .gte(timestamp_value(dialect, lower)),
        )
        .and_where(
            Expr::col((Scrobbles::Table, Scrobbles::Timestamp)).lte(upper_bound(dialect, at)),
        )
        .cond_where(
            Cond::any()
                .add(title_and_artist_match(dialect, title, artist))
                // Same recording, differing metadata.
                .add(match mb_id {
                    Some(mb_id) => Expr::col((Tracks::Table, Tracks::MbId)).eq(mb_id),
                    None => Expr::val(false).into(),
                })
                .add(match isrc {
                    Some(isrc) => Expr::col((Tracks::Table, Tracks::Isrc)).eq(isrc),
                    None => Expr::val(false).into(),
                }),
        )
        .limit(1)
        .to_owned();

    let row: Option<i64> = pool.fetch_scalar(&stmt).await?;

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

/// A timestamp as a value comparable against `scrobbles.timestamp`.
///
/// The column is Postgres `TIMESTAMP` (no zone), so the value goes in as a
/// `NaiveDateTime` — sqlx encodes a `DateTime<Utc>` as `TIMESTAMPTZ` and the
/// comparison would be against the wrong type. SQLite holds ISO-8601 text.
fn timestamp_value(dialect: Dialect, at: DateTime<Utc>) -> SimpleExpr {
    match dialect {
        Dialect::Postgres => at.naive_utc().into(),
        Dialect::Sqlite => rocksky_db::format_timestamp(at).into(),
    }
}

/// The upper end of the window: `at + max(240s, 0.4×duration + 60s)`, capped
/// at `1.2×duration`.
///
/// The Spotify poller stamps a play ~40% in, so the same play's row lands
/// after `at`; the cap stops a back-to-back repeat of a short track — whose
/// next play starts at `at + duration` — being swallowed.
///
/// Both dialects need the arithmetic in SQL, because it depends on the matched
/// row's duration, and neither spells it the same way: Postgres adds an
/// interval, SQLite adds seconds to a `julianday`. `GREATEST`/`LEAST` are also
/// Postgres-only; SQLite's variadic `max`/`min` do the same job.
fn upper_bound(dialect: Dialect, at: DateTime<Utc>) -> SimpleExpr {
    // `NULLIF(duration, 0)` so a zero duration degrades to the fallback
    // rather than producing a zero-width window; GREATEST/LEAST ignore NULLs.
    match dialect {
        Dialect::Postgres => Expr::cust_with_values(
            "$1::timestamp + make_interval(secs => LEAST(GREATEST($2, \
             NULLIF(\"tracks\".\"duration\", 0) / 1000.0 * 0.4 + 60.0), \
             NULLIF(\"tracks\".\"duration\", 0) / 1000.0 * 1.2))",
            [
                sea_query::Value::from(at.naive_utc()),
                sea_query::Value::from(FALLBACK_POST_WINDOW_SECS),
            ],
        ),
        // `strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+N seconds')` cannot take a
        // computed N, so the arithmetic goes through julianday and back.
        Dialect::Sqlite => Expr::cust_with_values(
            "strftime('%Y-%m-%dT%H:%M:%fZ', julianday(?) + \
             min(max(?, NULLIF(\"tracks\".\"duration\", 0) / 1000.0 * 0.4 + 60.0), \
             coalesce(NULLIF(\"tracks\".\"duration\", 0) / 1000.0 * 1.2, 1e9)) / 86400.0)",
            [
                sea_query::Value::from(rocksky_db::format_timestamp(at)),
                sea_query::Value::from(FALLBACK_POST_WINDOW_SECS),
            ],
        ),
    }
}

/// Title and artist matching, which is the fuzzy strategy.
///
/// On Postgres the title has its punctuation collapsed — "Strobes Pt. 2"
/// against "Strobes, Pt. 2" — and the artist matches on the full string or on
/// the primary credit, since Spotify-sourced rows store comma-joined artists
/// ("Flume, HWLS, slowthai") while Last.fm reports just "Flume".
///
/// SQLite has neither `regexp_replace` nor `split_part`, and this deliberately
/// does *not* reimplement them with a chain of `replace()` calls: getting that
/// subtly wrong would make two different songs compare equal and suppress a
/// legitimate scrobble. Comparing trimmed, lower-cased strings instead is less
/// fuzzy, so the failure mode is an occasional duplicate row rather than a
/// missing play — which is the right way round. The MBID and ISRC strategies
/// are unaffected and catch most of what the normalisation would have.
fn title_and_artist_match(dialect: Dialect, title: &str, artist: &str) -> SimpleExpr {
    match dialect {
        Dialect::Postgres => Expr::cust_with_values(
            "(btrim(regexp_replace(lower(\"tracks\".\"title\"), '[^a-z0-9]+', ' ', 'g')) \
               = btrim(regexp_replace(lower($1), '[^a-z0-9]+', ' ', 'g')) \
             AND (lower(btrim(\"tracks\".\"artist\")) = lower(btrim($2)) \
                  OR lower(btrim(split_part(\"tracks\".\"artist\", ',', 1))) \
                     = lower(btrim(split_part($2, ',', 1)))))",
            [title.to_string(), artist.to_string()],
        ),
        Dialect::Sqlite => Expr::cust_with_values(
            "(lower(trim(\"tracks\".\"title\")) = lower(trim(?)) \
             AND lower(trim(\"tracks\".\"artist\")) = lower(trim(?)))",
            [title.to_string(), artist.to_string()],
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The dedup window, executed against a real SQLite.
    ///
    /// This query was the most Postgres-bound in the repository:
    /// `make_interval`, `$1::timestamp`, `GREATEST`/`LEAST`,
    /// `regexp_replace`, `split_part` and `btrim`, none of which SQLite has.
    /// A rendering assertion cannot tell whether the replacements *bound the
    /// same window*, so this seeds a scrobble and walks the boundary.
    #[tokio::test]
    async fn the_window_matches_the_same_play_and_not_the_next_one() {
        let db = rocksky_db::connect_in_memory().await.unwrap();

        let user = rocksky_db::new_id();
        insert(
            &db,
            "users",
            &[
                ("xata_id", &user),
                ("did", "did:plc:alice"),
                ("handle", "alice.test"),
                ("avatar", ""),
            ],
        )
        .await;

        // A three-minute track.
        let track = rocksky_db::new_id();
        insert(
            &db,
            "tracks",
            &[
                ("xata_id", &track),
                ("title", "Never Be Like You"),
                ("artist", "Flume, Kai"),
                ("album_artist", "Flume"),
                ("album", "Skin"),
                ("duration", "180000"),
                ("sha256", &track),
            ],
        )
        .await;

        // Scrobbled at 12:00:00.
        let at = chrono::DateTime::parse_from_rfc3339("2026-01-01T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        insert(
            &db,
            "scrobbles",
            &[
                ("xata_id", &rocksky_db::new_id()),
                ("user_id", &user),
                ("track_id", &track),
                ("timestamp", &rocksky_db::format_timestamp(at)),
            ],
        )
        .await;

        let check = |when: chrono::DateTime<Utc>| {
            already_scrobbled(
                &db,
                &user,
                "Never Be Like You",
                "Flume, Kai",
                None,
                None,
                when,
            )
        };

        // The same play, reported a few seconds earlier by another source:
        // inside the 30s skew window.
        assert!(check(at - chrono::Duration::seconds(20)).await.unwrap());
        // …and reported later, within `0.4×duration + 60s` = 132s.
        assert!(check(at - chrono::Duration::seconds(100)).await.unwrap());

        // A play three hours later is a different play.
        assert!(!check(at + chrono::Duration::hours(3)).await.unwrap());
        // And one well before the window is a previous, legitimate play.
        assert!(!check(at - chrono::Duration::hours(3)).await.unwrap());

        // A different song at the same moment is not a duplicate.
        assert!(
            !already_scrobbled(&db, &user, "Some Other Song", "Flume, Kai", None, None, at)
                .await
                .unwrap()
        );

        // Another user's play is not this user's duplicate.
        assert!(!already_scrobbled(
            &db,
            "rec_someone_else",
            "Never Be Like You",
            "Flume, Kai",
            None,
            None,
            at
        )
        .await
        .unwrap());
    }

    /// The MBID strategy, which is dialect-independent and is what carries the
    /// fuzzy matching SQLite does not do.
    #[tokio::test]
    async fn an_mbid_matches_across_differing_metadata() {
        let db = rocksky_db::connect_in_memory().await.unwrap();

        let user = rocksky_db::new_id();
        insert(
            &db,
            "users",
            &[
                ("xata_id", &user),
                ("did", "did:plc:alice"),
                ("handle", "alice.test"),
                ("avatar", ""),
            ],
        )
        .await;

        let track = rocksky_db::new_id();
        insert(
            &db,
            "tracks",
            &[
                ("xata_id", &track),
                ("title", "Strobes, Pt. 2"),
                ("artist", "Flume"),
                ("album_artist", "Flume"),
                ("album", "Skin"),
                ("duration", "180000"),
                ("mb_id", "mb-123"),
                ("sha256", &track),
            ],
        )
        .await;

        let at = chrono::DateTime::parse_from_rfc3339("2026-01-01T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        insert(
            &db,
            "scrobbles",
            &[
                ("xata_id", &rocksky_db::new_id()),
                ("user_id", &user),
                ("track_id", &track),
                ("timestamp", &rocksky_db::format_timestamp(at)),
            ],
        )
        .await;

        // A differently punctuated title — which SQLite's comparison will not
        // match — is still caught by the MBID.
        assert!(already_scrobbled(
            &db,
            &user,
            "Strobes Pt 2",
            "Flume",
            Some("mb-123"),
            None,
            at
        )
        .await
        .unwrap());

        // An empty MBID must not match every null-MBID row.
        assert!(!already_scrobbled(
            &db,
            &user,
            "Something Else Entirely",
            "Nobody",
            Some("  "),
            None,
            at
        )
        .await
        .unwrap());
    }

    async fn insert(db: &Backend, table: &str, values: &[(&str, &str)]) {
        let mut stmt = Query::insert();
        stmt.into_table(sea_query::Alias::new(table))
            .columns(values.iter().map(|(c, _)| sea_query::Alias::new(*c)))
            .values_panic(values.iter().map(|(_, v)| (*v).into()));
        db.execute(&stmt).await.unwrap();
    }
}

#[cfg(test)]
mod postgres_rendering {
    use super::*;
    use sea_query_binder::SqlxBinder;

    /// Every marker in the Postgres fragments has to actually bind.
    ///
    /// sea-query substitutes `$N` inside a custom fragment by tokenising it,
    /// and it does *not* look inside every construct — a marker in
    /// `ARRAY[$1]` is emitted verbatim, the value is dropped, and the literal
    /// `$1` then collides with the statement's own first parameter. That bug
    /// cost real rows elsewhere in this repository, so these fragments — which
    /// put markers inside nested `LEAST(GREATEST(…))` calls — are checked
    /// rather than assumed.
    #[test]
    fn the_postgres_fragments_bind_every_value() {
        let at = chrono::DateTime::parse_from_rfc3339("2026-01-01T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);

        let mut stmt = Query::select();
        stmt.expr(Expr::val(1))
            .from(Scrobbles::Table)
            // A parameter first, so an unsubstituted marker collides with it.
            .and_where(Expr::col((Scrobbles::Table, Scrobbles::UserId)).eq("rec_user"))
            .and_where(
                Expr::col((Scrobbles::Table, Scrobbles::Timestamp))
                    .lte(upper_bound(Dialect::Postgres, at)),
            )
            .cond_where(Cond::any().add(title_and_artist_match(
                Dialect::Postgres,
                "Never Be Like You",
                "Flume, Kai",
            )));

        let (sql, values) = stmt.build_sqlx(sea_query::PostgresQueryBuilder);
        let bound: Vec<String> = values
            .0
             .0
            .iter()
            .filter_map(|v| match v {
                sea_query::Value::String(Some(s)) => Some(s.to_string()),
                _ => None,
            })
            .collect();

        // The title and artist reached the parameter list rather than the SQL.
        assert!(
            bound.iter().any(|v| v == "Never Be Like You"),
            "{sql} {bound:?}"
        );
        assert!(bound.iter().any(|v| v == "Flume, Kai"), "{sql} {bound:?}");
        assert!(!sql.contains("Never Be Like You"), "spliced: {sql}");

        // And no marker was left unsubstituted: after rendering, the only
        // `$N` left must be within the statement's own parameter count.
        let highest = sql
            .split('$')
            .skip(1)
            .filter_map(|rest| {
                let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                digits.parse::<usize>().ok()
            })
            .max()
            .unwrap_or(0);
        assert!(
            highest <= values.0 .0.len(),
            "the statement references ${highest} but binds only {} values: {sql}",
            values.0 .0.len()
        );
    }
}

/// The dedup window against a real Postgres.
///
/// Gated on `ROCKSKY_TEST_POSTGRES_URL`:
///
/// ```sh
/// ROCKSKY_TEST_POSTGRES_URL=postgres://postgres:pw@127.0.0.1:55433/mirror \
///   cargo test -p rocksky-mirror --lib postgres_window
/// ```
///
/// The SQLite tests above prove the rewrite runs; this proves the *Postgres*
/// half still bounds the same window, which matters because its fragments are
/// hand-written SQL with markers inside nested function calls. The two halves
/// answering differently would mean duplicate scrobbles on one backend or
/// suppressed plays on the other.
#[cfg(test)]
mod postgres_window {
    use super::*;

    fn url() -> Option<String> {
        std::env::var("ROCKSKY_TEST_POSTGRES_URL")
            .ok()
            .filter(|u| !u.is_empty())
    }

    #[tokio::test]
    async fn the_window_matches_the_same_play_and_not_the_next_one() {
        let Some(url) = url() else {
            eprintln!("skipping: ROCKSKY_TEST_POSTGRES_URL is not set");
            return;
        };
        let pool = sqlx::PgPool::connect(&url).await.expect("connect");
        let db = Backend::Postgres {
            primary: pool,
            replica: None,
        };

        let at = chrono::DateTime::parse_from_rfc3339("2026-01-01T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);

        let check = |when: chrono::DateTime<Utc>| {
            already_scrobbled(
                &db,
                "u1",
                "Never Be Like You",
                "Flume, Kai",
                None,
                None,
                when,
            )
        };

        // The same expectations the SQLite test makes, so the two backends are
        // held to one window.
        assert!(check(at - chrono::Duration::seconds(20)).await.unwrap());
        assert!(check(at - chrono::Duration::seconds(100)).await.unwrap());
        assert!(!check(at + chrono::Duration::hours(3)).await.unwrap());
        assert!(!check(at - chrono::Duration::hours(3)).await.unwrap());

        // And the fuzzy title matching, which is the Postgres-only half:
        // punctuation differences still match.
        assert!(
            already_scrobbled(&db, "u1", "Never Be Like You!!", "Flume", None, None, at)
                .await
                .unwrap()
        );
    }
}
