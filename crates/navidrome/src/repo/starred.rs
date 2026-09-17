use anyhow::Error;
use chrono::{DateTime, Utc};
use sea_query::{Alias, Expr, Iden, JoinType, Order, Query, SimpleExpr};

use crate::repo::track::one_upload_join;
use crate::schema::{AlbumTracks, ArtistTracks, LovedTracks, Tracks, UserUploads};
use crate::sql;
use rocksky_pgurl::Db;

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

impl sqlx::FromRow<'_, sqlx::postgres::PgRow> for StarredTrack {
    fn from_row(row: &sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(Self {
            xata_id: row.try_get("xata_id")?,
            title: row.try_get("title")?,
            artist: row.try_get("artist")?,
            album_artist: row.try_get("album_artist")?,
            album_art: row.try_get("album_art")?,
            album: row.try_get("album")?,
            track_number: row.try_get("track_number")?,
            disc_number: row.try_get("disc_number")?,
            duration: row.try_get("duration")?,
            mb_id: row.try_get("mb_id")?,
            genre: row.try_get("genre")?,
            xata_createdat: row.try_get("xata_createdat")?,
            r2_key: row.try_get("r2_key")?,
            mime_type: row.try_get("mime_type")?,
            file_size: row.try_get("file_size")?,
            sample_rate: row.try_get("sample_rate").unwrap_or(None),
            album_id: row.try_get("album_id")?,
            artist_id: row.try_get("artist_id")?,
            starred_at: row.try_get("starred_at")?,
        })
    }
}

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
