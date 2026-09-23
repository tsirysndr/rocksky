//! `GET /1/stats/user/{user_name}/...` — the charts screens.
//!
//! # One ranking, three hydrations
//!
//! Top artists, releases and recordings are the same query with a different
//! `GROUP BY` column: rank one user's `scrobbles` rows by play count inside
//! the window, then fetch the catalogue rows for the winning ids. The count
//! and the detail cannot come from one statement without grouping over every
//! selected column, and the ranking's order is what the response preserves —
//! re-sorting the hydrated rows would lose how ties were broken.
//!
//! # `total_*_count` is not optional
//!
//! Clients page these by asking for `count` at `offset` and dividing the
//! total to learn how many pages there are. Leave the total out and the
//! chart renders one page and stops, so it is counted with a second
//! `COUNT(DISTINCT ...)` over the same window rather than guessed from the
//! page size.

pub mod activity;
pub mod artists;
pub mod recordings;
pub mod release_groups;
pub mod releases;

use anyhow::Error;
use rocksky_db::schema::{Artists, Scrobbles};
use rocksky_db::sea_query::{Alias, Asterisk, Expr, Func, JoinType, Order, Query, SelectStatement};
use rocksky_db::Backend;

use crate::listenbrainz::range::Window;
use crate::listenbrainz::types::{StatsPayload, StatsResponse};

/// What a client gets for asking for no particular number.
pub const DEFAULT_COUNT: i64 = 25;
/// ListenBrainz's own ceiling per request.
pub const MAX_COUNT: i64 = 100;

#[derive(Debug, Clone, Default)]
pub struct StatsParams {
    pub range: Option<String>,
    pub count: Option<i64>,
    pub offset: Option<i64>,
}

impl StatsParams {
    pub fn count(&self) -> i64 {
        self.count.unwrap_or(DEFAULT_COUNT).clamp(1, MAX_COUNT)
    }

    pub fn offset(&self) -> i64 {
        self.offset.unwrap_or(0).max(0)
    }
}

/// The skeleton every stats response shares, with the entry list left empty.
pub fn payload(
    user_name: &str,
    range: &str,
    window: &Window,
    params: &StatsParams,
) -> StatsPayload {
    StatsPayload {
        artists: None,
        releases: None,
        recordings: None,
        release_groups: None,
        total_artist_count: None,
        total_release_count: None,
        total_recording_count: None,
        total_release_group_count: None,
        count: 0,
        offset: params.offset(),
        range: range.to_string(),
        from_ts: window.from.timestamp(),
        to_ts: window.to.timestamp(),
        // These are computed live, so they were last updated just now. A
        // client shows this as the chart's freshness.
        last_updated: chrono::Utc::now().timestamp(),
        user_id: user_name.to_string(),
    }
}

pub fn response(payload: StatsPayload) -> StatsResponse {
    StatsResponse { payload }
}

/// Narrows a `scrobbles` query to the window, on the bare column.
///
/// Never on a function of it: wrapping `timestamp` makes the predicate
/// unusable by `scrobbles_user_id_timestamp_idx`, and these are the queries
/// that most need it.
fn within(db: &Backend, query: &mut SelectStatement, window: &Window) {
    query
        .and_where(
            Expr::col((Scrobbles::Table, Scrobbles::Timestamp)).gte(db.timestamp(window.from)),
        )
        .and_where(Expr::col((Scrobbles::Table, Scrobbles::Timestamp)).lt(db.timestamp(window.to)));
}

/// `(id, play_count)` for one user, ranked, over `column`.
pub async fn rank(
    db: &Backend,
    user_id: &str,
    column: Scrobbles,
    window: &Window,
    params: &StatsParams,
) -> Result<Vec<(String, i64)>, Error> {
    let mut query = Query::select();
    query
        .expr_as(Expr::col((Scrobbles::Table, column)), Alias::new("id"))
        .expr_as(Func::count(Expr::col(Asterisk)), Alias::new("plays"))
        .from(Scrobbles::Table)
        .and_where(Expr::col((Scrobbles::Table, Scrobbles::UserId)).eq(user_id))
        .and_where(Expr::col((Scrobbles::Table, column)).is_not_null());

    exclude_various_artists(&mut query, column);
    within(db, &mut query, window);

    query
        .add_group_by([Expr::col(column).into()])
        .order_by(Alias::new("plays"), Order::Desc)
        // Ties broken by id, so paging is stable: without it two entries on
        // the same count can swap between pages and one is shown twice.
        .order_by(column, Order::Asc)
        .limit(params.count() as u64)
        .offset(params.offset() as u64);

    Ok(db.fetch_all::<(String, i64)>(&query).await?)
}

/// How many distinct entries the window holds, for the client's page count.
pub async fn total(
    db: &Backend,
    user_id: &str,
    column: Scrobbles,
    window: &Window,
) -> Result<i64, Error> {
    let mut query = Query::select();
    query
        .expr(Func::count_distinct(Expr::col((Scrobbles::Table, column))))
        .from(Scrobbles::Table)
        .and_where(Expr::col((Scrobbles::Table, Scrobbles::UserId)).eq(user_id))
        .and_where(Expr::col((Scrobbles::Table, column)).is_not_null());

    exclude_various_artists(&mut query, column);
    within(db, &mut query, window);

    Ok(db.count(&query).await?)
}

/// Keeps the compilation placeholder off the top-artists chart.
///
/// "Various Artists" is not someone anyone listens to, and with no join it
/// tops the chart of anyone who plays compilations. The album and track
/// charts are left alone: a compilation is a real album and its tracks are
/// real tracks. `app.rocksky.actor.getActorArtists` draws the same line.
fn exclude_various_artists(query: &mut SelectStatement, column: Scrobbles) {
    if column != Scrobbles::ArtistId {
        return;
    }
    query
        .join(
            JoinType::InnerJoin,
            Artists::Table,
            Expr::col((Artists::Table, Artists::XataId))
                .equals((Scrobbles::Table, Scrobbles::ArtistId)),
        )
        .and_where(Expr::col((Artists::Table, Artists::Name)).ne("Various Artists"));
}
