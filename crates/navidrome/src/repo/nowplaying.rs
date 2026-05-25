use anyhow::Error;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};

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
            handle: row.try_get("handle")?,
            minutes_ago: row.try_get("minutes_ago")?,
        })
    }
}

// Returns the user's most recent scrobble if within the last 10 minutes.
pub async fn get_now_playing(
    pool: &Pool<Postgres>,
    user_id: &str,
) -> Result<Vec<NowPlayingEntry>, Error> {
    let rows: Vec<NowPlayingEntry> = sqlx::query_as(
        r#"
        SELECT
            tracks.xata_id,
            tracks.title,
            tracks.artist,
            tracks.album_artist,
            tracks.album_art,
            tracks.album,
            tracks.track_number,
            tracks.disc_number,
            tracks.duration,
            tracks.mb_id,
            tracks.genre,
            tracks.xata_createdat,
            user_uploads.r2_key,
            user_uploads.mime_type,
            user_uploads.file_size,
            users.handle,
            EXTRACT(EPOCH FROM (NOW() - scrobbles.timestamp))::bigint / 60 AS minutes_ago
        FROM scrobbles
        JOIN tracks ON scrobbles.track_id = tracks.xata_id
        JOIN user_uploads ON tracks.xata_id = user_uploads.track_id
        JOIN users ON scrobbles.user_id = users.xata_id
        WHERE scrobbles.user_id = $1
          AND user_uploads.user_id = $1
          AND scrobbles.timestamp >= NOW() - INTERVAL '10 minutes'
        ORDER BY scrobbles.timestamp DESC
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}
