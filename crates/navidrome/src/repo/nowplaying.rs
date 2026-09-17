use anyhow::Error;
use chrono::{DateTime, Utc};
use sea_query::{Alias, Expr, JoinType, Order, Query};

use crate::schema::{Scrobbles, Tracks, UserUploads, Users};
use crate::sql;
use rocksky_pgurl::Db;

pub struct NowPlayingEntry {
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
    pub handle: String,
    pub minutes_ago: i64,
}

impl sqlx::FromRow<'_, sqlx::postgres::PgRow> for NowPlayingEntry {
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
            handle: row.try_get("handle")?,
            minutes_ago: row.try_get("minutes_ago")?,
        })
    }
}

// Returns the user's most recent scrobble if within the last 10 minutes.
pub async fn get_now_playing(db: &Db, user_id: &str) -> Result<Vec<NowPlayingEntry>, Error> {
    let pool = db.primary();
    let stmt = Query::select()
        .columns([
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
        .column((Users::Table, Users::Handle))
        .expr_as(
            Expr::cust(r#"EXTRACT(EPOCH FROM (NOW() - "scrobbles"."timestamp"))::bigint / 60"#),
            Alias::new("minutes_ago"),
        )
        .from(Scrobbles::Table)
        .join(
            JoinType::Join,
            Tracks::Table,
            Expr::col((Scrobbles::Table, Scrobbles::TrackId))
                .equals((Tracks::Table, Tracks::XataId)),
        )
        .join(
            JoinType::Join,
            UserUploads::Table,
            Expr::col((Tracks::Table, Tracks::XataId))
                .equals((UserUploads::Table, UserUploads::TrackId)),
        )
        .join(
            JoinType::Join,
            Users::Table,
            Expr::col((Scrobbles::Table, Scrobbles::UserId)).equals((Users::Table, Users::XataId)),
        )
        .and_where(Expr::col((Scrobbles::Table, Scrobbles::UserId)).eq(user_id))
        .and_where(Expr::col((UserUploads::Table, UserUploads::UserId)).eq(user_id))
        .and_where(
            Expr::col((Scrobbles::Table, Scrobbles::Timestamp))
                .gte(Expr::cust("NOW() - INTERVAL '10 minutes'")),
        )
        .order_by((Scrobbles::Table, Scrobbles::Timestamp), Order::Desc)
        .limit(1)
        .take();

    Ok(sql::fetch_all(pool, &stmt).await?)
}
