//! `/1/feedback/...` — loving and hating recordings.
//!
//! ListenBrainz models a love as a *feedback* row scored `1`, an unlove as
//! `0` and a hate as `-1`. Rocksky has only the first two: a track is liked or
//! it is not. So a hate is recorded as "not liked" — which is what the user
//! asked for in the only sense this catalogue can express — and the
//! distinction is lost rather than the request being refused.

pub mod get_feedback;
pub mod recording_feedback;

use anyhow::Error;
use rocksky_db::models::{Track, TRACK_COLS};
use rocksky_db::schema::Tracks;
use rocksky_db::sea_query::{Expr, Order, Query};
use rocksky_db::Backend;

use crate::listenbrainz::msid;

/// The track a feedback request names.
///
/// A client sends one of two identifiers and never both reliably: an MBID
/// when it has one, and otherwise the recording MSID it was handed by a
/// listen or a chart. The MBID is tried first because it is the stronger
/// claim; the MSID resolves through the catalogue hash it encodes.
///
/// A single MusicBrainz recording can legitimately have several rows here —
/// the same recording on a single and on a compilation — so the MBID lookup
/// picks the oldest deterministically rather than whichever the planner
/// returned first, and a client that sent an MSID reaches the exact row that
/// MSID came from.
pub async fn resolve(
    db: &Backend,
    recording_mbid: Option<&str>,
    recording_msid: Option<&str>,
) -> Result<Option<Track>, Error> {
    if let Some(mbid) = recording_mbid.map(str::trim).filter(|id| !id.is_empty()) {
        let mut query = Query::select();
        db.select_model(&mut query, TRACK_COLS, None);
        query
            .from(Tracks::Table)
            .and_where(Expr::col(Tracks::MbId).eq(mbid))
            .order_by(Tracks::XataCreatedat, Order::Asc)
            .limit(1);

        if let Some(track) = db.fetch_optional::<Track>(&query).await? {
            return Ok(Some(track));
        }
    }

    let Some(prefix) = recording_msid.and_then(msid::to_sha256_prefix) else {
        return Ok(None);
    };

    let mut query = Query::select();
    db.select_model(&mut query, TRACK_COLS, None);
    query
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Sha256).like(format!("{prefix}%")))
        .order_by(Tracks::XataCreatedat, Order::Asc)
        .limit(1);

    Ok(db.fetch_optional::<Track>(&query).await?)
}
