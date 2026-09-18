use anyhow::Error;
use rocksky_db::schema::{AlbumTracks, Albums, UserAlbums};
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

    // An error rather than indexing into an empty vector: a panic here takes
    // down the scrobble that triggered it, with nothing to say why.
    pool.fetch_optional(&stmt)
        .await?
        .ok_or_else(|| anyhow::anyhow!("no album for track {track_id}"))
}

pub async fn get_album_by_uri(pool: &Backend, uri: &str) -> Result<Album, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(UserAlbums::Table)
        .join(
            JoinType::LeftJoin,
            Albums::Table,
            Expr::col((UserAlbums::Table, UserAlbums::AlbumId))
                .equals((Albums::Table, Albums::XataId)),
        )
        // Either the user's own copy of the record or the album's canonical
        // one: both are AT-URIs naming the same album.
        .and_where(
            Expr::col((UserAlbums::Table, UserAlbums::Uri))
                .eq(uri)
                .or(Expr::col((Albums::Table, Albums::Uri)).eq(uri)),
        )
        .limit(1)
        .to_owned();

    pool.fetch_optional(&stmt)
        .await?
        .ok_or_else(|| anyhow::anyhow!("no album for {uri}"))
}
