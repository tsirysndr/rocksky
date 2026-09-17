use anyhow::Error;
use sea_query::{
    Alias, BinOper, CommonTableExpression, Expr, ExprTrait, Func, Iden, JoinType, Order, Query,
    SelectStatement, SimpleExpr, WithClause,
};

use crate::repo::track::lower_eq;
use crate::schema::{
    AlbumTracks, Albums, ArtistAlbums, ArtistTracks, Artists, Tracks, UserUploads,
};
use crate::sql;
use crate::xata::artist::{ArtistRow, ArtistWithStats};
use rocksky_db::Handle as Db;

#[derive(Iden, Clone, Copy)]
#[iden = "mine"]
enum Mine {
    Table,
    #[iden = "track_id"]
    TrackId,
    #[iden = "album_artist"]
    AlbumArtist,
}

#[derive(Iden, Clone, Copy)]
#[iden = "mine_albums"]
enum MineAlbums {
    Table,
    #[iden = "album_id"]
    AlbumId,
    #[iden = "album_artist"]
    AlbumArtist,
}

#[derive(Iden, Clone, Copy)]
#[iden = "album_counts"]
enum AlbumCounts {
    Table,
    #[iden = "artist_id"]
    ArtistId,
    #[iden = "album_count"]
    AlbumCount,
}

#[derive(Iden, Clone, Copy)]
#[iden = "mine_artists"]
enum MineArtists {
    Table,
    #[iden = "artist_id"]
    ArtistId,
}

#[derive(Iden, Clone, Copy)]
#[iden = "uu"]
enum Uu {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "t"]
enum T {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "m"]
enum M {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "ma"]
enum Ma {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "ar"]
enum Ar {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "ac"]
enum Ac {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "aa"]
enum Aa {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "atr"]
enum Atr {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "atk"]
enum Atk {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "alb"]
enum Alb {
    Table,
}

/// The caller's own uploads, and the artists reachable from them.
///
/// This walks outward from `user_uploads` rather than inward from `artists`.
/// The catalogue tables are global — every scrobble by every Rocksky user lands
/// in them, so `artists` holds 65k rows and `tracks` 547k — while everyone's
/// uploads put together are 10k rows. Scanning `artists` and testing each row
/// with a correlated EXISTS therefore did work proportional to the catalogue
/// instead of to the library being listed: 65k index searches into `tracks`,
/// 506k into `user_uploads`, ~10s for the largest library. Starting from the
/// uploads makes it 0.8s for byte-identical output.
///
/// MATERIALIZED is load-bearing. Inlined, the planner hoists `artists` back to
/// the driving position, merge-joins 64k of them against the library and
/// rebuilds a 245k-row intermediate — the exact shape this avoids.
///
/// `lower(ar.name) = lower(…album_artist)` on every junction join stays:
/// artist_tracks has polluted entries linking tracks to artists they don't
/// credit, and without the guard a single stray row puts a stranger's artist in
/// the caller's library. See commit 8f06a470.
fn mine_artists_cte(user_id: &str) -> WithClause {
    let mine = Query::select()
        .column((Uu::Table, UserUploads::TrackId))
        .column((T::Table, Tracks::AlbumArtist))
        .from_as(UserUploads::Table, Uu::Table)
        .join_as(
            JoinType::Join,
            Tracks::Table,
            T::Table,
            Expr::col((T::Table, Tracks::XataId)).equals((Uu::Table, UserUploads::TrackId)),
        )
        .and_where(Expr::col((Uu::Table, UserUploads::UserId)).eq(user_id))
        .take();

    let mine_albums = Query::select()
        .distinct()
        .column((Atr::Table, AlbumTracks::AlbumId))
        .column((M::Table, Mine::AlbumArtist))
        .from_as(Mine::Table, M::Table)
        .join_as(
            JoinType::Join,
            AlbumTracks::Table,
            Atr::Table,
            Expr::col((Atr::Table, AlbumTracks::TrackId)).equals((M::Table, Mine::TrackId)),
        )
        .take();

    let album_counts = Query::select()
        .column((Aa::Table, ArtistAlbums::ArtistId))
        .expr_as(
            Func::count_distinct(Expr::col((Aa::Table, ArtistAlbums::AlbumId))),
            AlbumCounts::AlbumCount,
        )
        .from_as(MineAlbums::Table, Ma::Table)
        .join_as(
            JoinType::Join,
            ArtistAlbums::Table,
            Aa::Table,
            Expr::col((Aa::Table, ArtistAlbums::AlbumId)).equals((Ma::Table, MineAlbums::AlbumId)),
        )
        .join_as(
            JoinType::Join,
            Artists::Table,
            Ar::Table,
            Expr::col((Ar::Table, Artists::XataId))
                .equals((Aa::Table, ArtistAlbums::ArtistId))
                .and(lower_eq(
                    Expr::col((Ar::Table, Artists::Name)),
                    Expr::col((Ma::Table, MineAlbums::AlbumArtist)),
                )),
        )
        .group_by_col((Aa::Table, ArtistAlbums::ArtistId))
        .take();

    let mine_artists = Query::select()
        .distinct()
        .column((Atk::Table, ArtistTracks::ArtistId))
        .from_as(Mine::Table, M::Table)
        .join_as(
            JoinType::Join,
            ArtistTracks::Table,
            Atk::Table,
            Expr::col((Atk::Table, ArtistTracks::TrackId)).equals((M::Table, Mine::TrackId)),
        )
        .join_as(
            JoinType::Join,
            Artists::Table,
            Ar::Table,
            Expr::col((Ar::Table, Artists::XataId))
                .equals((Atk::Table, ArtistTracks::ArtistId))
                .and(lower_eq(
                    Expr::col((Ar::Table, Artists::Name)),
                    Expr::col((M::Table, Mine::AlbumArtist)),
                )),
        )
        .take();

    WithClause::new()
        .cte(
            CommonTableExpression::new()
                .query(mine)
                .table_name(Mine::Table)
                .materialized(true)
                .to_owned(),
        )
        .cte(
            CommonTableExpression::new()
                .query(mine_albums)
                .table_name(MineAlbums::Table)
                .materialized(true)
                .to_owned(),
        )
        .cte(
            CommonTableExpression::new()
                .query(album_counts)
                .table_name(AlbumCounts::Table)
                .materialized(true)
                .to_owned(),
        )
        .cte(
            CommonTableExpression::new()
                .query(mine_artists)
                .table_name(MineArtists::Table)
                .materialized(true)
                .to_owned(),
        )
        .to_owned()
}

/// `artists` joined to the CTEs, which is the shape both listings share.
fn artists_from_cte() -> SelectStatement {
    Query::select()
        .columns([
            (Artists::Table, Artists::XataId),
            (Artists::Table, Artists::Name),
            (Artists::Table, Artists::Picture),
        ])
        .expr_as(
            Func::coalesce([
                Expr::col((Ac::Table, AlbumCounts::AlbumCount)).into(),
                Expr::val(0).into(),
            ]),
            AlbumCounts::AlbumCount,
        )
        .from_as(MineArtists::Table, Ma::Table)
        .join(
            JoinType::Join,
            Artists::Table,
            Expr::col((Artists::Table, Artists::XataId)).equals((Ma::Table, MineArtists::ArtistId)),
        )
        .join_as(
            JoinType::LeftJoin,
            AlbumCounts::Table,
            Ac::Table,
            Expr::col((Ac::Table, AlbumCounts::ArtistId))
                .equals((Ma::Table, MineArtists::ArtistId)),
        )
        .take()
}

pub async fn get_all_artists(db: &Db, user_id: &str) -> Result<Vec<ArtistWithStats>, Error> {
    let pool = db.replica();
    let mut select = artists_from_cte();
    select
        .order_by((Artists::Table, Artists::Name), Order::Asc)
        .order_by((Artists::Table, Artists::XataId), Order::Asc);

    let stmt = select.with(mine_artists_cte(user_id));

    Ok(sql::fetch_all(pool, &stmt).await?)
}

pub async fn get_artist_by_id(
    db: &Db,
    artist_id: &str,
    user_id: &str,
) -> Result<Option<ArtistRow>, Error> {
    let pool = db.replica();
    // Same junction-table consistency check as get_all_artists: only count
    // artist_tracks rows where the track's album_artist actually matches this
    // artist's name, otherwise polluted junction entries let strangers'
    // artists pass.
    let credited = Query::select()
        .expr(Expr::cust("1"))
        .from_as(ArtistTracks::Table, Atk::Table)
        .join_as(
            JoinType::Join,
            Tracks::Table,
            Alias::new("tr"),
            Expr::col((Alias::new("tr"), Tracks::XataId))
                .equals((Atk::Table, ArtistTracks::TrackId))
                .and(lower_eq(
                    Expr::col((Alias::new("tr"), Tracks::AlbumArtist)),
                    Expr::col((Artists::Table, Artists::Name)),
                )),
        )
        .join_as(
            JoinType::Join,
            UserUploads::Table,
            Uu::Table,
            Expr::col((Uu::Table, UserUploads::TrackId))
                .equals((Atk::Table, ArtistTracks::TrackId)),
        )
        .and_where(
            Expr::col((Atk::Table, ArtistTracks::ArtistId))
                .equals((Artists::Table, Artists::XataId)),
        )
        .and_where(Expr::col((Uu::Table, UserUploads::UserId)).eq(user_id))
        .take();

    let stmt = Query::select()
        .columns([
            (Artists::Table, Artists::XataId),
            (Artists::Table, Artists::Name),
            (Artists::Table, Artists::Picture),
            (Artists::Table, Artists::XataCreatedat),
        ])
        .from(Artists::Table)
        .and_where(Expr::col((Artists::Table, Artists::XataId)).eq(artist_id))
        .and_where(Expr::exists(credited))
        .take();

    Ok(sql::fetch_optional(pool, &stmt).await?)
}

pub async fn search_artists(
    db: &Db,
    user_id: &str,
    query: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<ArtistWithStats>, Error> {
    let pool = db.replica();
    // Same shape as get_all_artists — see `mine_artists_cte` for why it is
    // built this way and why the junction guard has to stay.
    let mut select = artists_from_cte();
    select
        .and_where(
            Func::lower(Expr::col((Artists::Table, Artists::Name))).binary(
                BinOper::Like,
                Func::lower(Expr::val(format!("%{}%", query))),
            ),
        )
        .order_by((Artists::Table, Artists::Name), Order::Asc)
        .order_by((Artists::Table, Artists::XataId), Order::Asc)
        .limit(count.max(0) as u64)
        .offset(offset.max(0) as u64);

    let stmt = select.with(mine_artists_cte(user_id));

    Ok(sql::fetch_all(pool, &stmt).await?)
}

/// Fetch artists matching names returned by Typesense.
pub async fn get_artists_by_names(
    db: &Db,
    user_id: &str,
    names: &[String],
) -> Result<Vec<ArtistWithStats>, Error> {
    let pool = db.replica();
    if names.is_empty() {
        return Ok(vec![]);
    }

    let album_count = SimpleExpr::SubQuery(
        None,
        Box::new(
            Query::select()
                .expr(Func::count_distinct(Expr::col((
                    Alb::Table,
                    Albums::XataId,
                ))))
                .from_as(Albums::Table, Alb::Table)
                .join_as(
                    JoinType::Join,
                    ArtistAlbums::Table,
                    Aa::Table,
                    Expr::col((Alb::Table, Albums::XataId))
                        .equals((Aa::Table, ArtistAlbums::AlbumId)),
                )
                .join_as(
                    JoinType::Join,
                    AlbumTracks::Table,
                    Atr::Table,
                    Expr::col((Alb::Table, Albums::XataId))
                        .equals((Atr::Table, AlbumTracks::AlbumId)),
                )
                .join_as(
                    JoinType::Join,
                    Tracks::Table,
                    Alias::new("tr"),
                    Expr::col((Atr::Table, AlbumTracks::TrackId))
                        .equals((Alias::new("tr"), Tracks::XataId))
                        .and(lower_eq(
                            Expr::col((Alias::new("tr"), Tracks::Album)),
                            Expr::col((Alb::Table, Albums::Title)),
                        ))
                        .and(lower_eq(
                            Expr::col((Alias::new("tr"), Tracks::AlbumArtist)),
                            Expr::col((Alb::Table, Albums::Artist)),
                        )),
                )
                .join_as(
                    JoinType::Join,
                    UserUploads::Table,
                    Uu::Table,
                    Expr::col((Alias::new("tr"), Tracks::XataId))
                        .equals((Uu::Table, UserUploads::TrackId)),
                )
                .and_where(
                    Expr::col((Aa::Table, ArtistAlbums::ArtistId))
                        .equals((Artists::Table, Artists::XataId)),
                )
                .and_where(Expr::col((Uu::Table, UserUploads::UserId)).eq(user_id))
                .take()
                .into_sub_query_statement(),
        ),
    );

    let stmt = Query::select()
        .columns([
            (Artists::Table, Artists::XataId),
            (Artists::Table, Artists::Name),
            (Artists::Table, Artists::Picture),
        ])
        .expr_as(album_count, AlbumCounts::AlbumCount)
        .from(Artists::Table)
        .join(
            JoinType::Join,
            ArtistTracks::Table,
            Expr::col((Artists::Table, Artists::XataId))
                .equals((ArtistTracks::Table, ArtistTracks::ArtistId)),
        )
        .join(
            JoinType::Join,
            Tracks::Table,
            Expr::col((ArtistTracks::Table, ArtistTracks::TrackId))
                .equals((Tracks::Table, Tracks::XataId))
                .and(lower_eq(
                    Expr::col((Tracks::Table, Tracks::AlbumArtist)),
                    Expr::col((Artists::Table, Artists::Name)),
                )),
        )
        .join(
            JoinType::Join,
            UserUploads::Table,
            Expr::col((Tracks::Table, Tracks::XataId))
                .equals((UserUploads::Table, UserUploads::TrackId)),
        )
        .and_where(Expr::col((UserUploads::Table, UserUploads::UserId)).eq(user_id))
        .and_where(Expr::col((Artists::Table, Artists::Name)).is_in(names.to_vec()))
        .group_by_columns([
            (Artists::Table, Artists::XataId),
            (Artists::Table, Artists::Name),
            (Artists::Table, Artists::Picture),
        ])
        .order_by((Artists::Table, Artists::Name), Order::Asc)
        .order_by((Artists::Table, Artists::XataId), Order::Asc)
        .take();

    Ok(sql::fetch_all(pool, &stmt).await?)
}

pub async fn get_picture_by_artist_id(db: &Db, artist_id: &str) -> Result<Option<String>, Error> {
    let pool = db.replica();
    let stmt = Query::select()
        .column(Artists::Picture)
        .from(Artists::Table)
        .and_where(Expr::col(Artists::XataId).eq(artist_id))
        .take();

    Ok(sql::fetch_scalar_optional::<Option<String>>(pool, &stmt)
        .await?
        .flatten())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_query::PostgresQueryBuilder;
    use sea_query_binder::SqlxBinder;

    /// Without the `lower(name) = lower(album_artist)` guard on each junction
    /// join, one polluted `artist_tracks` row puts a stranger's artist in the
    /// caller's library.
    #[test]
    fn every_junction_join_keeps_its_name_guard() {
        let (sql, _) = artists_from_cte()
            .take()
            .with(mine_artists_cte("rec_user"))
            .build_sqlx(PostgresQueryBuilder);
        assert_eq!(
            sql.matches(r#"LOWER("ar"."name") = LOWER("#).count(),
            2,
            "album_counts and mine_artists each need the guard"
        );
        assert_eq!(sql.matches("AS  MATERIALIZED").count(), 4);
    }
}
