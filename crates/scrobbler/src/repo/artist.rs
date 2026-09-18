use anyhow::Error;
use rocksky_db::schema::{ArtistTracks, Artists, UserArtists};
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

    pool.fetch_optional(&stmt)
        .await?
        .ok_or_else(|| anyhow::anyhow!("no artist for track {track_id}"))
}

pub async fn get_artist_by_uri(pool: &Backend, uri: &str) -> Result<Artist, Error> {
    let stmt = Query::select()
        .column(Asterisk)
        .from(UserArtists::Table)
        .join(
            JoinType::LeftJoin,
            Artists::Table,
            Expr::col((UserArtists::Table, UserArtists::ArtistId))
                .equals((Artists::Table, Artists::XataId)),
        )
        .and_where(
            Expr::col((UserArtists::Table, UserArtists::Uri))
                .eq(uri)
                .or(Expr::col((Artists::Table, Artists::Uri)).eq(uri)),
        )
        .limit(1)
        .to_owned();

    pool.fetch_optional(&stmt)
        .await?
        .ok_or_else(|| anyhow::anyhow!("no artist for {uri}"))
}
