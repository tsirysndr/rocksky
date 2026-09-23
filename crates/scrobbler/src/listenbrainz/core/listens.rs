//! `GET /1/user/{user_name}/listens` — the listen history, newest first.
//!
//! # Paging is by timestamp, not by page number
//!
//! There is no `offset` here and clients do not send one: they page by passing
//! the oldest `listened_at` they have as `max_ts` and asking for the next
//! `count`. `payload.oldest_listen_ts` is what tells them whether to stop, and
//! it is the *account's* oldest listen rather than the page's — a client
//! compares the two and concludes there is another page when the page has not
//! reached the bottom yet. Answering the page's own oldest would make every
//! page look like the last one.

use anyhow::Error;
use chrono::{DateTime, Utc};
use rocksky_db::loaders;
use rocksky_db::models::{Scrobble, User, SCROBBLE_COLS};
use rocksky_db::schema::Scrobbles;
use rocksky_db::sea_query::{Alias, Expr, Func, Order, Query};
use rocksky_db::Backend;

use crate::listenbrainz::catalogue;
use crate::listenbrainz::types::{Listen, ListensPayload, ListensResponse};

/// What ListenBrainz returns when the client asks for no particular number.
pub const DEFAULT_COUNT: i64 = 25;
/// ListenBrainz's own ceiling, kept so a client cannot ask for the whole
/// history in one request.
pub const MAX_COUNT: i64 = 1000;

#[derive(Debug, Clone, Copy, Default)]
pub struct ListensParams {
    pub count: Option<i64>,
    /// Unix seconds. Only listens *older* than this, which is how a client
    /// asks for the next page.
    pub max_ts: Option<i64>,
    /// Unix seconds. Only listens *newer* than this.
    pub min_ts: Option<i64>,
}

impl ListensParams {
    pub fn count(&self) -> i64 {
        self.count.unwrap_or(DEFAULT_COUNT).clamp(1, MAX_COUNT)
    }
}

pub async fn get_listens(
    db: &Backend,
    user: &User,
    params: ListensParams,
) -> Result<ListensResponse, Error> {
    let mut query = Query::select();
    db.select_model(&mut query, SCROBBLE_COLS, None);
    query
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::UserId).eq(&user.id));

    // Both bounds are exclusive, as ListenBrainz's are: a client paging with
    // `max_ts` set to the last row it holds must not be handed that row again.
    if let Some(max_ts) = params.max_ts {
        query.and_where(Expr::col(Scrobbles::Timestamp).lt(db.timestamp(seconds(max_ts))));
    }
    if let Some(min_ts) = params.min_ts {
        query.and_where(Expr::col(Scrobbles::Timestamp).gt(db.timestamp(seconds(min_ts))));
    }

    query
        .order_by(Scrobbles::Timestamp, Order::Desc)
        .limit(params.count() as u64);

    let scrobbles: Vec<Scrobble> = db.fetch_all(&query).await?;
    let tracks = loaders::tracks_by_id(db, scrobbles.iter().map(|s| s.track_id.clone())).await?;

    let listens: Vec<Listen> = scrobbles
        .iter()
        .filter_map(|scrobble| {
            // A scrobble whose track row is gone cannot be rendered; skipping
            // it keeps the rest of the page.
            let track = tracks.get(scrobble.track_id.as_deref()?)?;
            Some(Listen {
                listened_at: Some(scrobble.timestamp.timestamp()),
                inserted_at: Some(scrobble.created_at.timestamp()),
                playing_now: None,
                recording_msid: catalogue::recording_msid(track),
                user_name: user.handle.clone(),
                track_metadata: catalogue::track_metadata(track),
            })
        })
        .collect();

    let (oldest, latest) = bounds(db, &user.id).await?;

    Ok(ListensResponse {
        payload: ListensPayload {
            count: listens.len(),
            listens,
            latest_listen_ts: latest,
            oldest_listen_ts: oldest,
            playing_now: None,
            user_id: user.handle.clone(),
        },
    })
}

/// The two ends of an account's history, as the database hands them back.
type Extremes = (Option<DateTime<Utc>>, Option<DateTime<Utc>>);

/// The account's oldest and newest listen, in Unix seconds.
///
/// One statement rather than two, and both aggregates ride the
/// `(user_id, timestamp)` index.
async fn bounds(db: &Backend, user_id: &str) -> Result<(Option<i64>, Option<i64>), Error> {
    let mut query = Query::select();
    query
        .expr_as(
            db.cast_timestamp(Func::min(Expr::col(Scrobbles::Timestamp))),
            Alias::new("oldest"),
        )
        .expr_as(
            db.cast_timestamp(Func::max(Expr::col(Scrobbles::Timestamp))),
            Alias::new("latest"),
        )
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::UserId).eq(user_id));

    let row: Option<Extremes> = db.fetch_optional(&query).await?;

    Ok(match row {
        Some((oldest, latest)) => (
            oldest.map(|at| at.timestamp()),
            latest.map(|at| at.timestamp()),
        ),
        None => (None, None),
    })
}

fn seconds(ts: i64) -> DateTime<Utc> {
    DateTime::from_timestamp(ts, 0).unwrap_or_else(Utc::now)
}
