//! `GET /1/stats/user/{user_name}/listening-activity` — the bar chart above
//! the charts screen.
//!
//! # Empty buckets are part of the answer
//!
//! The chart is a bar per day, month or year across the whole window, and a
//! day with no listens is a bar of height zero — not a missing bar. Returning
//! only the days that have rows makes the chart compress its gaps and read as
//! if listening were continuous. So the window is enumerated in Rust and the
//! counts are filled into it.
//!
//! # Why the grouping is always by day
//!
//! One `GROUP BY DATE(timestamp)` serves all three bucket sizes: a day is the
//! finest the chart ever shows, and rolling days up into months or years
//! afterwards costs nothing next to a second dialect-specific date function.
//! `DATE(...)` truncates a timestamp on Postgres and ISO text on SQLite and
//! both yield `YYYY-MM-DD`, so the statement itself stays portable.

use anyhow::Error;
use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc};
use rocksky_db::models::User;
use rocksky_db::schema::Scrobbles;
use rocksky_db::sea_query::{Alias, Asterisk, Expr, Func, Query};
use rocksky_db::Backend;
use std::collections::HashMap;

use crate::listenbrainz::range::{Bucket, Window};
use crate::listenbrainz::types::{ActivityBucket, ActivityPayload, ActivityResponse};

pub async fn get_listening_activity(
    db: &Backend,
    user: &User,
    range: &str,
    window: &Window,
) -> Result<ActivityResponse, Error> {
    let per_day = count_per_day(db, &user.id, window).await?;

    // Days folded into whichever bucket they fall in, so filling the chart is
    // one lookup per bar rather than a scan of every day per bar.
    let mut counts: HashMap<DateTime<Utc>, i64> = HashMap::new();
    for (day, plays) in &per_day {
        *counts.entry(bucket_start(*day, window.bucket)).or_default() += plays;
    }

    // `all_time` starts at the ListenBrainz epoch, which would draw two
    // decades of empty bars for an account opened last year. The first bar is
    // the first bucket that has something in it.
    let from = match (window.bucket, counts.keys().min()) {
        (Bucket::Year, Some(first)) => (*first).max(window.from),
        (Bucket::Year, None) => window.to,
        _ => window.from,
    };

    let listening_activity = buckets(from, window.to, window.bucket)
        .into_iter()
        .map(|(start, end)| ActivityBucket {
            from_ts: start.timestamp(),
            to_ts: end.timestamp(),
            time_range: label(start, window.bucket),
            listen_count: counts.get(&start).copied().unwrap_or(0),
        })
        .collect();

    Ok(ActivityResponse {
        payload: ActivityPayload {
            listening_activity,
            from_ts: window.from.timestamp(),
            to_ts: window.to.timestamp(),
            last_updated: Utc::now().timestamp(),
            range: range.to_string(),
            user_id: user.handle.clone(),
        },
    })
}

/// `YYYY-MM-DD -> plays` for one user inside the window.
async fn count_per_day(
    db: &Backend,
    user_id: &str,
    window: &Window,
) -> Result<HashMap<NaiveDate, i64>, Error> {
    let day = Func::cust(Alias::new("DATE")).arg(Expr::col(Scrobbles::Timestamp));

    let mut query = Query::select();
    query
        // Projected through `cast_text` because `DATE(...)` is a `date` on
        // Postgres, which sqlx will not decode into a `String`. Grouping and
        // ordering keep the uncast expression.
        .expr_as(db.cast_text(day.clone()), Alias::new("day"))
        .expr_as(Func::count(Expr::col(Asterisk)), Alias::new("plays"))
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::UserId).eq(user_id))
        .and_where(Expr::col(Scrobbles::Timestamp).gte(db.timestamp(window.from)))
        .and_where(Expr::col(Scrobbles::Timestamp).lt(db.timestamp(window.to)))
        .add_group_by([day.into()]);

    Ok(db
        .fetch_all::<(String, i64)>(&query)
        .await?
        .into_iter()
        .filter_map(|(day, plays)| {
            // Postgres renders a date as `YYYY-MM-DD`; SQLite's `DATE()` over
            // an ISO timestamp does too. Anything else is not a day.
            NaiveDate::parse_from_str(day.get(..10).unwrap_or(&day), "%Y-%m-%d")
                .ok()
                .map(|day| (day, plays))
        })
        .collect())
}

/// Every bucket covering `[from, to)`, as half-open `(start, end)` pairs.
///
/// The last one runs past `to` when the period is still in progress, which is
/// what ListenBrainz does: the bar for the current month covers the whole
/// month and is simply not full yet.
fn buckets(
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    bucket: Bucket,
) -> Vec<(DateTime<Utc>, DateTime<Utc>)> {
    let mut spans = Vec::new();
    let mut start = bucket_start(from.date_naive(), bucket);

    // A guard rather than a `while true`: a window that somehow resolved
    // inverted must not spin forever inside a request handler.
    while start < to && spans.len() < 4_000 {
        let end = next(start, bucket);
        spans.push((start, end));
        start = end;
    }
    spans
}

fn bucket_start(day: NaiveDate, bucket: Bucket) -> DateTime<Utc> {
    let start = match bucket {
        Bucket::Day => day,
        Bucket::Month => NaiveDate::from_ymd_opt(day.year(), day.month(), 1).unwrap_or(day),
        Bucket::Year => NaiveDate::from_ymd_opt(day.year(), 1, 1).unwrap_or(day),
    };
    midnight(start)
}

fn next(start: DateTime<Utc>, bucket: Bucket) -> DateTime<Utc> {
    let day = start.date_naive();
    match bucket {
        Bucket::Day => start + Duration::days(1),
        Bucket::Month => {
            let (year, month) = if day.month() == 12 {
                (day.year() + 1, 1)
            } else {
                (day.year(), day.month() + 1)
            };
            NaiveDate::from_ymd_opt(year, month, 1)
                .map(midnight)
                .unwrap_or(start + Duration::days(31))
        }
        Bucket::Year => NaiveDate::from_ymd_opt(day.year() + 1, 1, 1)
            .map(midnight)
            .unwrap_or(start + Duration::days(365)),
    }
}

fn midnight(day: NaiveDate) -> DateTime<Utc> {
    day.and_hms_opt(0, 0, 0)
        .map(|at| Utc.from_utc_datetime(&at))
        .unwrap_or_else(Utc::now)
}

/// The bar's own label, used by clients that do not format the timestamps
/// themselves.
fn label(start: DateTime<Utc>, bucket: Bucket) -> String {
    match bucket {
        Bucket::Day => start.format("%A %-d %B %Y").to_string(),
        Bucket::Month => start.format("%B %Y").to_string(),
        Bucket::Year => start.format("%Y").to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(text)
            .unwrap()
            .with_timezone(&Utc)
    }

    /// A week is seven bars whether or not anything was played on each day.
    #[test]
    fn every_day_in_the_window_gets_a_bucket() {
        let spans = buckets(
            at("2026-09-14T00:00:00Z"),
            at("2026-09-21T00:00:00Z"),
            Bucket::Day,
        );
        assert_eq!(spans.len(), 7);
        assert_eq!(spans[0].0, at("2026-09-14T00:00:00Z"));
        assert_eq!(spans[6].1, at("2026-09-21T00:00:00Z"));
    }

    /// Month buckets have to land on month boundaries, including over a year
    /// end — a naive "add 30 days" drifts and eventually doubles a month.
    #[test]
    fn month_buckets_follow_the_calendar() {
        let spans = buckets(
            at("2025-11-15T00:00:00Z"),
            at("2026-02-01T00:00:00Z"),
            Bucket::Month,
        );
        let starts: Vec<_> = spans.iter().map(|(start, _)| start.to_rfc3339()).collect();
        assert_eq!(
            starts,
            vec![
                at("2025-11-01T00:00:00Z").to_rfc3339(),
                at("2025-12-01T00:00:00Z").to_rfc3339(),
                at("2026-01-01T00:00:00Z").to_rfc3339(),
            ]
        );
    }

    /// The window's final period is charted whole even though it is still
    /// running, so the bar for the current month exists from its first day.
    #[test]
    fn the_period_in_progress_still_gets_its_bucket() {
        let spans = buckets(
            at("2026-09-01T00:00:00Z"),
            at("2026-09-23T14:00:00Z"),
            Bucket::Month,
        );
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].1, at("2026-10-01T00:00:00Z"));
    }
}
