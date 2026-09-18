use anyhow::Error;
use rocksky_db::schema::{AlbumTracks, Albums};
use rocksky_db::sea_query::{Asterisk, Expr, JoinType, Query};
use rocksky_db::Backend;

use crate::xata::album::Album;

pub async fn get_album_by_track_id(pool: &Backend, track_id: &str) -> Result<Album, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(Albums::Table)
        .join(
            JoinType::LeftJoin,
            AlbumTracks::Table,
            Expr::col((Albums::Table, Albums::XataId))
                .equals((AlbumTracks::Table, AlbumTracks::AlbumId)),
        )
        .and_where(Expr::col((AlbumTracks::Table, AlbumTracks::TrackId)).eq(track_id))
        .limit(1)
        .to_owned();

    // The caller treats a missing album as a bug rather than an outcome, which
    // is why this returns `Album` and not `Option<Album>` — but it used to
    // index into an empty vector to say so, and a panic in the scrobble path
    // takes the request down with no explanation.
    pool.fetch_optional(&stmt)
        .await?
        .ok_or_else(|| anyhow::anyhow!("no album for track {track_id}"))
}
