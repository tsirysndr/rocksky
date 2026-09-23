//! `GET /1/feedback/user/{user_name}/get-feedback` — the loved-tracks screen.

use anyhow::Error;
use rocksky_db::loaders;
use rocksky_db::models::User;
use rocksky_db::schema::LovedTracks;
use rocksky_db::sea_query::{Asterisk, Expr, Func, Order, Query};
use rocksky_db::Backend;

use crate::listenbrainz::catalogue;
use crate::listenbrainz::types::{FeedbackItem, FeedbackResponse};

pub const DEFAULT_COUNT: i64 = 25;
pub const MAX_COUNT: i64 = 100;

#[derive(Debug, Clone, Default)]
pub struct FeedbackParams {
    pub count: Option<i64>,
    pub offset: Option<i64>,
    /// `1` for loves, `-1` for hates, absent for both. Only loves exist here.
    pub score: Option<i32>,
}

impl FeedbackParams {
    fn count(&self) -> i64 {
        self.count.unwrap_or(DEFAULT_COUNT).clamp(1, MAX_COUNT)
    }

    fn offset(&self) -> i64 {
        self.offset.unwrap_or(0).max(0)
    }
}

pub async fn get_feedback(
    db: &Backend,
    user: &User,
    params: &FeedbackParams,
) -> Result<FeedbackResponse, Error> {
    // Nothing is stored with a negative score, so a request for hates is an
    // empty list rather than the loves under the wrong sign.
    if params.score.is_some_and(|score| score < 1) {
        return Ok(FeedbackResponse {
            count: 0,
            total_count: 0,
            offset: params.offset(),
            feedback: Vec::new(),
        });
    }

    let mut query = Query::select();
    query
        .column(LovedTracks::TrackId)
        .column(LovedTracks::XataCreatedat)
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::UserId).eq(&user.id))
        // Newest first, which is the order the screen shows — the tracks'
        // own order has nothing to do with when they were loved.
        .order_by(LovedTracks::XataCreatedat, Order::Desc)
        .limit(params.count() as u64)
        .offset(params.offset() as u64);

    let loved: Vec<(String, chrono::DateTime<chrono::Utc>)> = db.fetch_all(&query).await?;
    let by_id = loaders::tracks_by_id(db, loved.iter().map(|(id, _)| Some(id.clone()))).await?;

    let feedback: Vec<FeedbackItem> = loved
        .iter()
        .filter_map(|(track_id, loved_at)| {
            let track = by_id.get(track_id.as_str())?;
            Some(FeedbackItem {
                created: loved_at.timestamp(),
                score: 1,
                user_id: user.handle.clone(),
                recording_mbid: track.mb_id.clone(),
                recording_msid: catalogue::recording_msid(track),
                track_metadata: Some(catalogue::track_metadata(track)),
            })
        })
        .collect();

    let total = Query::select()
        .expr(Func::count(Expr::col(Asterisk)))
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::UserId).eq(&user.id))
        .to_owned();

    Ok(FeedbackResponse {
        count: feedback.len(),
        // The client divides this by the page size to learn how many pages
        // there are, so it is the whole list's size and not the page's.
        total_count: db.count(&total).await?,
        offset: params.offset(),
        feedback,
    })
}
