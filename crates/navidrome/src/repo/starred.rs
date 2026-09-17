use anyhow::Error;
use chrono::{DateTime, Utc};
use sea_query::{Alias, Expr, Iden, JoinType, Order, Query, SimpleExpr};

use crate::repo::track::one_upload_join;
use crate::schema::{AlbumTracks, ArtistTracks, LovedTracks, Tracks, UserUploads};
use crate::sql;
use rocksky_db::Handle as Db;

#[derive(Iden, Clone, Copy)]
#[iden = "at2"]
enum At2 {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "at3"]
enum At3 {
    Table,
}

pub struct StarredTrack {
    pub xata_id: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album_art: Option<String>,
    pub album: String,
    pub track_number: Option<i32>,
    pub disc_number: Option<i32>,
    pub duration: i32,
    pub mb_id: Option<String>,
    pub genre: Option<String>,
    pub xata_createdat: DateTime<Utc>,
    pub r2_key: String,
    pub mime_type: String,
    pub file_size: i32,
    pub sample_rate: Option<i32>,
    pub album_id: Option<String>,
    pub artist_id: Option<String>,
    pub starred_at: DateTime<Utc>,
}

// One impl for both backends: see `from_row_any!`. A hand-written `FromRow`
// names its row type, and `PgRow` and `SqliteRow` share no trait that
// `try_get` is defined on.
rocksky_db::from_row_any!(StarredTrack {
    xata_id: String,
    title: String,
    artist: String,
    album_artist: String,
    album_art: Option<String>,
    album: String,
    track_number: Option<i32>,
    disc_number: Option<i32>,
    duration: i32,
    mb_id: Option<String>,
    genre: Option<String>,
    xata_createdat: DateTime<Utc>,
    r2_key: String,
    mime_type: String,
    file_size: i32,
    sample_rate: Option<i32>,
    album_id: Option<String>,
    artist_id: Option<String>,
    starred_at: DateTime<Utc>,
});

/// `(SELECT <col> FROM <junction> WHERE track_id = tracks.xata_id LIMIT 1)`.
fn first_junction_id(
    table: impl sea_query::IntoTableRef,
    alias: impl sea_query::IntoIden + Copy + 'static,
    id_col: impl sea_query::IntoIden + 'static,
    track_col: impl sea_query::IntoIden + 'static,
) -> SimpleExpr {
    SimpleExpr::SubQuery(
        None,
        Box::new(
            Query::select()
                .column((alias, id_col))
                .from_as(table, alias)
                .and_where(Expr::col((alias, track_col)).equals((Tracks::Table, Tracks::XataId)))
                .limit(1)
                .take()
                .into_sub_query_statement(),
        ),
    )
}

pub async fn get_starred_tracks(db: &Db, user_id: &str) -> Result<Vec<StarredTrack>, Error> {
    let pool = db.primary();
    let mut stmt = Query::select();
    stmt.columns([
        (Tracks::Table, Tracks::XataId),
        (Tracks::Table, Tracks::Title),
        (Tracks::Table, Tracks::Artist),
        (Tracks::Table, Tracks::AlbumArtist),
        (Tracks::Table, Tracks::AlbumArt),
        (Tracks::Table, Tracks::Album),
        (Tracks::Table, Tracks::TrackNumber),
        (Tracks::Table, Tracks::DiscNumber),
        (Tracks::Table, Tracks::Duration),
        (Tracks::Table, Tracks::MbId),
        (Tracks::Table, Tracks::Genre),
        (Tracks::Table, Tracks::XataCreatedat),
    ])
    .columns([
        (UserUploads::Table, UserUploads::R2Key),
        (UserUploads::Table, UserUploads::MimeType),
        (UserUploads::Table, UserUploads::FileSize),
        (UserUploads::Table, UserUploads::SampleRate),
    ])
    .expr_as(
        first_junction_id(
            AlbumTracks::Table,
            At2::Table,
            AlbumTracks::AlbumId,
            AlbumTracks::TrackId,
        ),
        Alias::new("album_id"),
    )
    .expr_as(
        first_junction_id(
            ArtistTracks::Table,
            At3::Table,
            ArtistTracks::ArtistId,
            ArtistTracks::TrackId,
        ),
        Alias::new("artist_id"),
    )
    .expr_as(
        Expr::col((LovedTracks::Table, LovedTracks::XataCreatedat)),
        Alias::new("starred_at"),
    )
    .from(LovedTracks::Table)
    .join(
        JoinType::Join,
        Tracks::Table,
        Expr::col((LovedTracks::Table, LovedTracks::TrackId))
            .equals((Tracks::Table, Tracks::XataId)),
    );

    one_upload_join(&mut stmt, user_id);

    stmt.and_where(Expr::col((LovedTracks::Table, LovedTracks::UserId)).eq(user_id))
        .order_by(
            (LovedTracks::Table, LovedTracks::XataCreatedat),
            Order::Desc,
        );

    Ok(sql::fetch_all(pool, &stmt).await?)
}
