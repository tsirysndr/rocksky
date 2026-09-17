use anyhow::Error;
use chrono::{DateTime, Utc};
use sea_query::{Expr, Func, OnConflict, Query};

use crate::schema::{LovedTracks, Scrobbles};
use crate::sql;
use rocksky_db::Handle as Db;

pub async fn create_scrobble(
    db: &Db,
    user_id: &str,
    track_id: &str,
    album_id: Option<&str>,
    artist_id: Option<&str>,
    timestamp: DateTime<Utc>,
) -> Result<(), Error> {
    let pool = db.primary();
    let stmt = Query::insert()
        .into_table(Scrobbles::Table)
        .columns([
            Scrobbles::UserId,
            Scrobbles::TrackId,
            Scrobbles::AlbumId,
            Scrobbles::ArtistId,
            Scrobbles::Timestamp,
        ])
        .values_panic([
            user_id.into(),
            track_id.into(),
            album_id.map(str::to_string).into(),
            artist_id.map(str::to_string).into(),
            timestamp.into(),
        ])
        .on_conflict(
            OnConflict::columns([Scrobbles::UserId, Scrobbles::TrackId, Scrobbles::Timestamp])
                .do_nothing()
                .to_owned(),
        )
        .to_owned();

    sql::execute(pool, &stmt).await?;
    Ok(())
}

pub async fn star_track(db: &Db, user_id: &str, track_id: &str) -> Result<(), Error> {
    let pool = db.primary();
    // `loved_tracks` has no unique constraint on (user, track), so there is no
    // conflict target to name — the guard has to be the WHERE NOT EXISTS.
    let already = Query::select()
        .expr(Expr::cust("1"))
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::UserId).eq(user_id))
        .and_where(Expr::col(LovedTracks::TrackId).eq(track_id))
        .take();

    let source = Query::select()
        .expr(Expr::val(user_id))
        .expr(Expr::val(track_id))
        .and_where(Expr::exists(already).not())
        .take();

    let mut stmt = Query::insert();
    stmt.into_table(LovedTracks::Table)
        .columns([LovedTracks::UserId, LovedTracks::TrackId])
        .select_from(source)?;

    sql::execute(pool, &stmt).await?;
    Ok(())
}

pub async fn unstar_track(db: &Db, user_id: &str, track_id: &str) -> Result<(), Error> {
    let pool = db.primary();
    let stmt = Query::delete()
        .from_table(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::UserId).eq(user_id))
        .and_where(Expr::col(LovedTracks::TrackId).eq(track_id))
        .to_owned();

    sql::execute(pool, &stmt).await?;
    Ok(())
}

pub async fn is_track_starred(db: &Db, user_id: &str, track_id: &str) -> Result<bool, Error> {
    let pool = db.primary();
    let stmt = Query::select()
        .expr(Func::count(Expr::cust("*")))
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::UserId).eq(user_id))
        .and_where(Expr::col(LovedTracks::TrackId).eq(track_id))
        .take();

    let count: i64 = sql::fetch_scalar(pool, &stmt).await?;
    Ok(count > 0)
}
