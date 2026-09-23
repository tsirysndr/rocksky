//! The nine `range` values the stats endpoints accept, as concrete UTC
//! windows.
//!
//! ListenBrainz splits them into "this X", which runs from the start of the
//! current period to now, and bare "X", which is the *previous whole* period —
//! `week` is last week, not the last seven days. Pano Scrobbler's period
//! picker builds exactly those windows client-side and labels the tab with
//! them, so a server that read `week` as a rolling seven days would answer
//! numbers that disagree with the label above them.
//!
//! The bucket size each range charts at is chosen to match the date format the
//! client labels the bars with — day-of-month for the short ranges, month for
//! the long ones, year for all time — so a bar and its label describe the same
//! span.

use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Bucket {
    Day,
    Month,
    Year,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Window {
    /// Inclusive.
    pub from: DateTime<Utc>,
    /// Exclusive, so two adjacent windows cannot both count the same listen.
    pub to: DateTime<Utc>,
    pub bucket: Bucket,
}

/// What a missing `range` parameter means, as on ListenBrainz.
pub const DEFAULT: &str = "all_time";

/// The earliest listen ListenBrainz accepts, and where `all_time` starts.
const EPOCH: (i32, u32, u32) = (2002, 10, 1);

/// Resolves `range` against `now`, or `None` if it is not one of the nine.
pub fn window(range: &str, now: DateTime<Utc>) -> Option<Window> {
    let today = now.date_naive();
    let this_month = first_of_month(today.year(), today.month())?;
    let this_year = NaiveDate::from_ymd_opt(today.year(), 1, 1)?;

    // Monday, which is the week start ListenBrainz and the clients agree on.
    let this_week = today - Duration::days(today.weekday().num_days_from_monday() as i64);

    let (from, to, bucket) = match range {
        "this_week" => (midnight(this_week)?, now, Bucket::Day),
        "week" => (
            midnight(this_week - Duration::days(7))?,
            midnight(this_week)?,
            Bucket::Day,
        ),
        "this_month" => (midnight(this_month)?, now, Bucket::Day),
        "month" => (
            midnight(shift_months(this_month, -1)?)?,
            midnight(this_month)?,
            Bucket::Day,
        ),
        "quarter" => {
            let quarter = first_of_month(today.year(), quarter_first_month(today.month()))?;
            (
                midnight(shift_months(quarter, -3)?)?,
                midnight(quarter)?,
                Bucket::Day,
            )
        }
        "half_yearly" => {
            let half = first_of_month(today.year(), if today.month() < 7 { 1 } else { 7 })?;
            (
                midnight(shift_months(half, -6)?)?,
                midnight(half)?,
                Bucket::Month,
            )
        }
        "this_year" => (midnight(this_year)?, now, Bucket::Month),
        "year" => (
            midnight(NaiveDate::from_ymd_opt(today.year() - 1, 1, 1)?)?,
            midnight(this_year)?,
            Bucket::Month,
        ),
        "all_time" => (
            midnight(NaiveDate::from_ymd_opt(EPOCH.0, EPOCH.1, EPOCH.2)?)?,
            now,
            Bucket::Year,
        ),
        _ => return None,
    };

    Some(Window { from, to, bucket })
}

fn midnight(date: NaiveDate) -> Option<DateTime<Utc>> {
    Some(Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0)?))
}

fn first_of_month(year: i32, month: u32) -> Option<NaiveDate> {
    NaiveDate::from_ymd_opt(year, month, 1)
}

/// `date` moved by whole months, landing on the first of the target month.
fn shift_months(date: NaiveDate, delta: i32) -> Option<NaiveDate> {
    let months = date.year() * 12 + date.month0() as i32 + delta;
    NaiveDate::from_ymd_opt(months.div_euclid(12), months.rem_euclid(12) as u32 + 1, 1)
}

fn quarter_first_month(month: u32) -> u32 {
    month - (month - 1) % 3
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(text)
            .unwrap()
            .with_timezone(&Utc)
    }

    /// The bare ranges are the *previous* whole period, which is what the
    /// client's own labels say. Read as a rolling window instead, "last month"
    /// would include half of this one.
    #[test]
    fn bare_ranges_are_the_previous_whole_period() {
        let now = at("2026-09-23T14:05:00Z");

        let week = window("week", now).unwrap();
        assert_eq!(week.from, at("2026-09-14T00:00:00Z"));
        assert_eq!(week.to, at("2026-09-21T00:00:00Z"));

        let month = window("month", now).unwrap();
        assert_eq!(month.from, at("2026-08-01T00:00:00Z"));
        assert_eq!(month.to, at("2026-09-01T00:00:00Z"));

        let year = window("year", now).unwrap();
        assert_eq!(year.from, at("2025-01-01T00:00:00Z"));
        assert_eq!(year.to, at("2026-01-01T00:00:00Z"));
    }

    /// The "this X" ones run to now, not to the end of the period: a chart of
    /// this month must not claim the days that have not happened.
    #[test]
    fn this_ranges_end_now() {
        let now = at("2026-09-23T14:05:00Z");

        assert_eq!(
            window("this_week", now).unwrap().from,
            at("2026-09-21T00:00:00Z")
        );
        assert_eq!(
            window("this_month", now).unwrap().from,
            at("2026-09-01T00:00:00Z")
        );
        assert_eq!(
            window("this_year", now).unwrap().from,
            at("2026-01-01T00:00:00Z")
        );
        assert_eq!(window("this_week", now).unwrap().to, now);
    }

    /// The quarter and half-year boundaries have to land on the calendar's,
    /// including across a year end — `quarter` in January is last October to
    /// January, not this year's.
    #[test]
    fn quarter_and_half_year_cross_the_year_end() {
        let january = at("2026-01-15T00:00:00Z");

        let quarter = window("quarter", january).unwrap();
        assert_eq!(quarter.from, at("2025-10-01T00:00:00Z"));
        assert_eq!(quarter.to, at("2026-01-01T00:00:00Z"));

        let half = window("half_yearly", january).unwrap();
        assert_eq!(half.from, at("2025-07-01T00:00:00Z"));
        assert_eq!(half.to, at("2026-01-01T00:00:00Z"));
    }

    #[test]
    fn quarters_start_in_january_april_july_and_october() {
        for (month, first) in [
            (1, 1),
            (3, 1),
            (4, 4),
            (6, 4),
            (7, 7),
            (9, 7),
            (10, 10),
            (12, 10),
        ] {
            assert_eq!(quarter_first_month(month), first, "month {month}");
        }
    }

    #[test]
    fn an_unknown_range_is_rejected_rather_than_defaulted() {
        assert!(window("fortnight", Utc::now()).is_none());
        assert!(window("all_time", Utc::now()).is_some());
    }
}
