use anyhow::Error;
use sea_query::{Alias, Expr, Func, Iden, JoinType, Order, Query};

use crate::repo::track::track_select;
use crate::schema::{ArtistAlbums, ArtistTracks, Artists, Tracks, UserUploads};
use crate::sql;
use crate::xata::track::TrackWithUpload;
use rocksky_pgurl::Db;

/// `UNNEST(artists.genres)` and the name it is grouped by. Postgres has no
/// table of genres — they are an array column on `artists` — so the expansion
/// itself is the grouping key.
#[derive(Iden, Clone, Copy)]
#[iden = "genre"]
struct GenreCol;

pub struct GenreRow {
    pub genre: String,
    pub song_count: i64,
    pub album_count: i64,
}

impl sqlx::FromRow<'_, sqlx::postgres::PgRow> for GenreRow {
    fn from_row(row: &sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(Self {
            genre: row.try_get("genre")?,
            song_count: row.try_get("song_count")?,
            album_count: row.try_get("album_count")?,
        })
    }
}

pub async fn get_genres(db: &Db, user_id: &str) -> Result<Vec<GenreRow>, Error> {
    let pool = db.replica();
    let stmt = Query::select()
        .expr_as(Expr::cust(r#"UNNEST("artists"."genres")"#), GenreCol)
        .expr_as(
            Func::count_distinct(Expr::col((ArtistTracks::Table, ArtistTracks::TrackId))),
            Alias::new("song_count"),
        )
        .expr_as(
            Func::count_distinct(Expr::col((ArtistAlbums::Table, ArtistAlbums::AlbumId))),
            Alias::new("album_count"),
        )
        .from(Artists::Table)
        .join(
            JoinType::Join,
            ArtistTracks::Table,
            Expr::col((Artists::Table, Artists::XataId))
                .equals((ArtistTracks::Table, ArtistTracks::ArtistId)),
        )
        .join(
            JoinType::Join,
            UserUploads::Table,
            Expr::col((ArtistTracks::Table, ArtistTracks::TrackId))
                .equals((UserUploads::Table, UserUploads::TrackId)),
        )
        .join(
            JoinType::LeftJoin,
            ArtistAlbums::Table,
            Expr::col((Artists::Table, Artists::XataId))
                .equals((ArtistAlbums::Table, ArtistAlbums::ArtistId)),
        )
        .and_where(Expr::col((UserUploads::Table, UserUploads::UserId)).eq(user_id))
        .and_where(Expr::col((Artists::Table, Artists::Genres)).is_not_null())
        .group_by_col(GenreCol)
        .order_by(GenreCol, Order::Asc)
        .take();

    Ok(sql::fetch_all(pool, &stmt).await?)
}

pub async fn get_songs_by_genre(
    db: &Db,
    user_id: &str,
    genre: &str,
    count: i64,
    offset: i64,
) -> Result<Vec<TrackWithUpload>, Error> {
    let pool = db.replica();
    // Hand-rolling the projection here left out the BYO-storage columns that
    // were later added to `TrackWithUpload`, so every row failed to deserialize
    // and getSongsByGenre returned nothing at all. Use the canonical select,
    // which is also the one that guards the album/artist junction lookups.
    let tagged = Query::select()
        .expr(Expr::cust("1"))
        .from(ArtistTracks::Table)
        .join(
            JoinType::Join,
            Artists::Table,
            Expr::col((ArtistTracks::Table, ArtistTracks::ArtistId))
                .equals((Artists::Table, Artists::XataId)),
        )
        .and_where(
            Expr::col((ArtistTracks::Table, ArtistTracks::TrackId))
                .equals((Tracks::Table, Tracks::XataId)),
        )
        .and_where(Expr::cust_with_values(
            r#"$1 = ANY("artists"."genres")"#,
            [genre],
        ))
        .take();

    let mut stmt = track_select(user_id);
    stmt.and_where(Expr::exists(tagged))
        .order_by((Tracks::Table, Tracks::Title), Order::Asc)
        .order_by((Tracks::Table, Tracks::XataId), Order::Asc)
        .limit(count.max(0) as u64)
        .offset(offset.max(0) as u64);

    Ok(sql::fetch_all(pool, &stmt).await?)
}
