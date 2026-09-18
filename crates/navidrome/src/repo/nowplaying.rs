use anyhow::Error;
use chrono::{DateTime, Utc};
use sea_query::{Alias, Expr, JoinType, Order, Query};

use crate::schema::{Scrobbles, Tracks, UserUploads, Users};
use crate::sql;
use rocksky_db::models::{minutes_ago_sql, minutes_since_sql};
use rocksky_db::Handle as Db;

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

// One impl for both backends: see `from_row_any!`. A hand-written `FromRow`
// names its row type, and `PgRow` and `SqliteRow` share no trait that
// `try_get` is defined on.
rocksky_db::from_row_any!(NowPlayingEntry {
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
    handle: String,
    minutes_ago: i64,
});

// Returns the user's most recent scrobble if within the last 10 minutes.
/// How recent a scrobble has to be to count as "now playing".
const NOW_PLAYING_WINDOW_MINUTES: u32 = 10;

pub async fn get_now_playing(db: &Db, user_id: &str) -> Result<Vec<NowPlayingEntry>, Error> {
    let pool = db.primary();
    let dialect = pool.dialect();
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
            // Neither `EXTRACT(EPOCH …)` nor an interval has a SQLite
            // spelling; both ends are in `rocksky_db::models`.
            Expr::cust(minutes_since_sql(dialect, r#""scrobbles"."timestamp""#)),
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
            Expr::col((Scrobbles::Table, Scrobbles::Timestamp)).gte(Expr::cust(minutes_ago_sql(
                dialect,
                NOW_PLAYING_WINDOW_MINUTES,
            ))),
        )
        .order_by((Scrobbles::Table, Scrobbles::Timestamp), Order::Desc)
        .limit(1)
        .take();

    Ok(sql::fetch_all(pool, &stmt).await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rocksky_db::Dialect;

    /// The now-playing lookup on SQLite.
    ///
    /// It carried the two time expressions with no SQLite spelling at all —
    /// `EXTRACT(EPOCH FROM (NOW() - ts))` and `NOW() - INTERVAL '10 minutes'`
    /// — so the query could not even parse there. Running it is the check.
    #[tokio::test]
    async fn the_now_playing_window_runs_on_sqlite() {
        let db = rocksky_db::connect_in_memory().await.unwrap();
        let handle = rocksky_db::Handle::from_backend(db);

        let entries = get_now_playing(&handle, "rec_nobody").await.unwrap();
        assert!(entries.is_empty());
    }

    /// Both halves of the window, rendered for each backend — the one thing a
    /// smoke test on an empty database cannot distinguish is a window that
    /// parses but bounds nothing.
    #[test]
    fn the_window_is_ten_minutes_on_both_backends() {
        for dialect in [Dialect::Postgres, Dialect::Sqlite] {
            let bound = minutes_ago_sql(dialect, NOW_PLAYING_WINDOW_MINUTES);
            assert!(bound.contains("10"), "{dialect:?}: {bound}");
            let elapsed = minutes_since_sql(dialect, "scrobbles.timestamp");
            assert!(elapsed.contains("scrobbles.timestamp"), "{dialect:?}");
        }

        // And neither dialect's spelling leaks into the other.
        assert!(minutes_ago_sql(Dialect::Sqlite, 10).contains("strftime"));
        assert!(!minutes_ago_sql(Dialect::Sqlite, 10).contains("INTERVAL"));
        assert!(minutes_ago_sql(Dialect::Postgres, 10).contains("INTERVAL"));
        assert!(!minutes_since_sql(Dialect::Sqlite, "x").contains("EXTRACT"));
    }
}
