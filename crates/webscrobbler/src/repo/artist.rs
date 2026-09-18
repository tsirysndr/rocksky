use anyhow::Error;
use rocksky_db::schema::{ArtistTracks, Artists};
use rocksky_db::sea_query::{Asterisk, Expr, JoinType, Query};
use rocksky_db::Backend;

use crate::xata::artist::Artist;

pub async fn get_artist_by_track_id(pool: &Backend, track_id: &str) -> Result<Artist, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(Artists::Table)
        .join(
            JoinType::LeftJoin,
            ArtistTracks::Table,
            Expr::col((Artists::Table, Artists::XataId))
                .equals((ArtistTracks::Table, ArtistTracks::ArtistId)),
        )
        .and_where(Expr::col((ArtistTracks::Table, ArtistTracks::TrackId)).eq(track_id))
        .limit(1)
        .to_owned();

    // As in `get_album_by_track_id`: an error rather than an index panic.
    pool.fetch_optional(&stmt)
        .await?
        .ok_or_else(|| anyhow::anyhow!("no artist for track {track_id}"))
}
