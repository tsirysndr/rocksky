use anyhow::Error;
use chrono::{DateTime, Utc};
use sea_query::{Alias, Expr, Func, Iden, JoinType, Order, Query, SimpleExpr};

use crate::repo::track::track_select;
use crate::schema::{NavidromePlaylistTracks, NavidromePlaylists, Tracks};
use crate::sql;
use crate::xata::track::TrackWithUpload;
use rocksky_db::models::json_array;
use rocksky_db::Dialect;
use rocksky_db::Handle as Db;

#[derive(Iden, Clone, Copy)]
#[iden = "p"]
enum P {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "pt"]
enum Pt {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "t"]
enum T {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "npt"]
enum Npt {
    Table,
}

#[derive(Iden, Clone, Copy)]
#[iden = "arts"]
enum Arts {
    Table,
    #[iden = "art"]
    Art,
    #[iden = "added_at"]
    AddedAt,
}

#[derive(sqlx::FromRow)]
pub struct PlaylistRow {
    pub xata_id: String,
    pub name: String,
    pub description: Option<String>,
    pub picture: Option<String>,
    pub created_by: String,
    pub xata_createdat: DateTime<Utc>,
    pub track_count: i64,
    /// Total playing time of the playlist's tracks, in **milliseconds** —
    /// `tracks.duration`'s own unit. Subsonic reports seconds, so the presenter
    /// divides. 0 for an empty playlist.
    pub duration_ms: i64,
    /// AT-URI of the `app.rocksky.playlist` record mirroring this playlist,
    /// NULL until the record has been published.
    pub uri: Option<String>,
    /// Album art of the first few distinct covers in the playlist, for the
    /// cover mosaic, as JSON array text. Read it with [`PlaylistRow::track_arts`].
    ///
    /// JSON rather than a list because the two backends aggregate differently
    /// — `array_agg` into a `text[]` on Postgres, `json_group_array` on SQLite
    /// — and `Vec<String>` decodes from neither. `track_arts_select` renders
    /// whichever produces JSON text.
    pub track_arts: Option<String>,
}

impl PlaylistRow {
    /// The cover mosaic's arts. Empty when none of the tracks have art.
    pub fn track_arts(&self) -> Vec<String> {
        json_array(self.track_arts.as_deref())
    }
}

fn scalar(select: sea_query::SelectStatement) -> SimpleExpr {
    SimpleExpr::SubQuery(None, Box::new(select.into_sub_query_statement()))
}

/// The playlist's entries, as a correlated subquery over `p`.
fn entries_of_playlist() -> sea_query::SelectStatement {
    Query::select()
        .from_as(NavidromePlaylistTracks::Table, Pt::Table)
        .and_where(
            Expr::col((Pt::Table, NavidromePlaylistTracks::PlaylistId))
                .equals((P::Table, NavidromePlaylists::XataId)),
        )
        .take()
}

// COALESCE because SUM over no rows is NULL, and an empty playlist is 0 long.
fn duration_select() -> SimpleExpr {
    let mut sum = entries_of_playlist();
    sum.expr(Func::sum(Expr::col((T::Table, Tracks::Duration))))
        .join_as(
            JoinType::Join,
            Tracks::Table,
            T::Table,
            Expr::col((T::Table, Tracks::XataId))
                .equals((Pt::Table, NavidromePlaylistTracks::TrackId)),
        );

    Func::cast_as(
        Func::coalesce([scalar(sum), Expr::val(0).into()]),
        Alias::new("bigint"),
    )
    .into()
}

// Up to four distinct album covers, in the order the tracks carrying them were
// added — enough for a 2×2 mosaic and no more.
fn track_arts_select(dialect: Dialect) -> SimpleExpr {
    let mut covers = entries_of_playlist();
    covers
        .expr_as(Expr::col((T::Table, Tracks::AlbumArt)), Arts::Art)
        .expr_as(
            Func::min(Expr::col((
                Pt::Table,
                NavidromePlaylistTracks::XataCreatedat,
            ))),
            Arts::AddedAt,
        )
        .join_as(
            JoinType::Join,
            Tracks::Table,
            T::Table,
            Expr::col((T::Table, Tracks::XataId))
                .equals((Pt::Table, NavidromePlaylistTracks::TrackId)),
        )
        .and_where(Expr::col((T::Table, Tracks::AlbumArt)).is_not_null())
        .and_where(Expr::col((T::Table, Tracks::AlbumArt)).ne(""))
        .group_by_col((T::Table, Tracks::AlbumArt))
        .order_by_expr(
            Func::min(Expr::col((
                Pt::Table,
                NavidromePlaylistTracks::XataCreatedat,
            )))
            .into(),
            Order::Asc,
        )
        .limit(4);

    // Aggregated to JSON text on both backends, because that is the only
    // shape `Vec<String>` cannot fail to come back as — see
    // `PlaylistRow::track_arts`.
    let aggregate = match dialect {
        // `array_agg(… ORDER BY …)` is an aggregate with its own sort clause,
        // which has no builder form.
        Dialect::Postgres => Expr::cust(r#"to_json(array_agg("art" ORDER BY "added_at"))::text"#),
        // `json_group_array` has no ORDER BY of its own; it follows the row
        // order of the subquery, which is already sorted by `added_at`.
        Dialect::Sqlite => Expr::cust(r#"json_group_array("art")"#),
    };

    let agg = Query::select()
        .expr(aggregate)
        .from_subquery(covers, Arts::Table)
        .take();

    // An empty playlist aggregates to SQL NULL on Postgres and to `[]` on
    // SQLite; both read back as an empty list, and the COALESCE makes the
    // column non-null either way.
    Func::coalesce([scalar(agg), Expr::val("[]").into()]).into()
}

// Navidrome playlists live in their own dedicated tables so they stay isolated
// from playlists ingested from other sources (atproto, Spotify, …).

/// The row projection every playlist lookup shares; only the WHERE differs.
fn playlist_select(dialect: Dialect, predicate: SimpleExpr) -> sea_query::SelectStatement {
    let count = {
        let mut q = entries_of_playlist();
        q.expr(Func::count(Expr::cust("*")));
        q
    };

    Query::select()
        .columns([
            (P::Table, NavidromePlaylists::XataId),
            (P::Table, NavidromePlaylists::Name),
            (P::Table, NavidromePlaylists::Description),
        ])
        .expr_as(
            Expr::val(Option::<String>::None).cast_as(Alias::new("text")),
            Alias::new("picture"),
        )
        .expr_as(
            Expr::col((P::Table, NavidromePlaylists::UserId)),
            Alias::new("created_by"),
        )
        .column((P::Table, NavidromePlaylists::XataCreatedat))
        .column((P::Table, NavidromePlaylists::Uri))
        .expr_as(scalar(count), Alias::new("track_count"))
        .expr_as(duration_select(), Alias::new("duration_ms"))
        .expr_as(track_arts_select(dialect), Alias::new("track_arts"))
        .from_as(NavidromePlaylists::Table, P::Table)
        .and_where(predicate)
        .take()
}

pub async fn get_playlists(db: &Db, user_id: &str) -> Result<Vec<PlaylistRow>, Error> {
    let pool = db.primary();
    let mut stmt = playlist_select(
        pool.dialect(),
        Expr::col((P::Table, NavidromePlaylists::UserId)).eq(user_id),
    );
    stmt.order_by((P::Table, NavidromePlaylists::XataCreatedat), Order::Desc);

    Ok(sql::fetch_all(pool, &stmt).await?)
}

/// Create an empty playlist owned by `user_id`; returns the new playlist id.
pub async fn create_playlist(
    db: &Db,
    user_id: &str,
    name: &str,
    description: Option<&str>,
) -> Result<String, Error> {
    let pool = db.primary();
    // Generate the id explicitly with gen_random_uuid() rather than relying on
    // the xata_id() default, which collides under rapid successive inserts
    // (duplicate primary key violations when bulk-adding tracks).
    let stmt = Query::insert()
        .into_table(NavidromePlaylists::Table)
        .columns([
            NavidromePlaylists::XataId,
            NavidromePlaylists::Name,
            NavidromePlaylists::Description,
            NavidromePlaylists::UserId,
        ])
        .values_panic([
            Expr::cust("gen_random_uuid()::text"),
            name.into(),
            description.map(str::to_string).into(),
            user_id.into(),
        ])
        .returning_col(NavidromePlaylists::XataId)
        .to_owned();

    Ok(sql::fetch_scalar(pool, &stmt).await?)
}

/// True when `user_id` owns the playlist (i.e. may mutate/delete it).
pub async fn is_owner(db: &Db, playlist_id: &str, user_id: &str) -> Result<bool, Error> {
    let pool = db.primary();
    let stmt = Query::select()
        .column(NavidromePlaylists::XataId)
        .from(NavidromePlaylists::Table)
        .and_where(Expr::col(NavidromePlaylists::XataId).eq(playlist_id))
        .and_where(Expr::col(NavidromePlaylists::UserId).eq(user_id))
        .take();

    let owner: Option<String> = sql::fetch_scalar_optional(pool, &stmt).await?;
    Ok(owner.is_some())
}

pub async fn update_meta(
    db: &Db,
    playlist_id: &str,
    name: Option<&str>,
    comment: Option<&str>,
) -> Result<(), Error> {
    if let Some(n) = name {
        set_column(db, playlist_id, NavidromePlaylists::Name, n).await?;
    }
    if let Some(c) = comment {
        set_column(db, playlist_id, NavidromePlaylists::Description, c).await?;
    }
    Ok(())
}

/// Sets one column and bumps `xata_updatedat`. `column` is a
/// [`NavidromePlaylists`] variant, so it cannot name anything that isn't a
/// column of this table.
async fn set_column(
    db: &Db,
    playlist_id: &str,
    column: NavidromePlaylists,
    value: &str,
) -> Result<(), Error> {
    let pool = db.primary();
    let stmt = Query::update()
        .table(NavidromePlaylists::Table)
        .value(column, value)
        .value(NavidromePlaylists::XataUpdatedat, Expr::cust("now()"))
        .and_where(Expr::col(NavidromePlaylists::XataId).eq(playlist_id))
        .to_owned();

    sql::execute(pool, &stmt).await?;
    Ok(())
}

/// Append a track (by its xata_id / Subsonic song id) to the playlist.
pub async fn add_track(db: &Db, playlist_id: &str, track_id: &str) -> Result<(), Error> {
    let pool = db.primary();
    // gen_random_uuid() for the primary key — the xata_id() default collides
    // under the rapid inserts of a bulk add.
    let insert = Query::insert()
        .into_table(NavidromePlaylistTracks::Table)
        .columns([
            NavidromePlaylistTracks::XataId,
            NavidromePlaylistTracks::PlaylistId,
            NavidromePlaylistTracks::TrackId,
        ])
        .values_panic([
            Expr::cust("gen_random_uuid()::text"),
            playlist_id.into(),
            track_id.into(),
        ])
        .to_owned();

    sql::execute(pool, &insert).await?;
    touch(db, playlist_id).await
}

/// Bumps `xata_updatedat` so clients see the playlist as changed.
async fn touch(db: &Db, playlist_id: &str) -> Result<(), Error> {
    let pool = db.primary();
    let stmt = Query::update()
        .table(NavidromePlaylists::Table)
        .value(NavidromePlaylists::XataUpdatedat, Expr::cust("now()"))
        .and_where(Expr::col(NavidromePlaylists::XataId).eq(playlist_id))
        .to_owned();

    sql::execute(pool, &stmt).await?;
    Ok(())
}

/// Remove the track at the given 0-based position (ordered as displayed).
pub async fn remove_track_at(db: &Db, playlist_id: &str, index: i64) -> Result<(), Error> {
    let pool = db.primary();
    let at_index = Query::select()
        .column(NavidromePlaylistTracks::XataId)
        .from(NavidromePlaylistTracks::Table)
        .and_where(Expr::col(NavidromePlaylistTracks::PlaylistId).eq(playlist_id))
        .order_by(NavidromePlaylistTracks::XataCreatedat, Order::Asc)
        .offset(index.max(0) as u64)
        .limit(1)
        .take();

    let entry_id: Option<String> = sql::fetch_scalar_optional(pool, &at_index).await?;

    if let Some(id) = entry_id {
        let delete = Query::delete()
            .from_table(NavidromePlaylistTracks::Table)
            .and_where(Expr::col(NavidromePlaylistTracks::XataId).eq(id))
            .to_owned();
        sql::execute(pool, &delete).await?;
        touch(db, playlist_id).await?;
    }
    Ok(())
}

pub async fn delete_playlist(db: &Db, playlist_id: &str) -> Result<(), Error> {
    let pool = db.primary();
    let entries = Query::delete()
        .from_table(NavidromePlaylistTracks::Table)
        .and_where(Expr::col(NavidromePlaylistTracks::PlaylistId).eq(playlist_id))
        .to_owned();
    sql::execute(pool, &entries).await?;

    let playlist = Query::delete()
        .from_table(NavidromePlaylists::Table)
        .and_where(Expr::col(NavidromePlaylists::XataId).eq(playlist_id))
        .to_owned();
    sql::execute(pool, &playlist).await?;
    Ok(())
}

pub async fn get_playlist(
    db: &Db,
    playlist_id: &str,
    user_id: &str,
) -> Result<Option<(PlaylistRow, Vec<TrackWithUpload>)>, Error> {
    let pool = db.primary();
    let stmt = playlist_select(
        pool.dialect(),
        Expr::col((P::Table, NavidromePlaylists::XataId))
            .eq(playlist_id)
            .and(Expr::col((P::Table, NavidromePlaylists::UserId)).eq(user_id)),
    );

    let playlist: Option<PlaylistRow> = sql::fetch_optional(pool, &stmt).await?;
    with_tracks(db, playlist, user_id).await
}

/// Look a playlist up by the AT-URI of the `app.rocksky.playlist` record
/// mirroring it.
///
/// The Navidrome id is local to this server, so anything that has to name a
/// playlist durably — an NFC tag, a share link, another client's record —
/// carries the record URI instead. `uri` is NULL until the mirror publishes the
/// record, so an unmirrored playlist simply doesn't resolve this way.
pub async fn get_playlist_by_uri(
    db: &Db,
    uri: &str,
    user_id: &str,
) -> Result<Option<(PlaylistRow, Vec<TrackWithUpload>)>, Error> {
    let pool = db.primary();
    let stmt = playlist_select(
        pool.dialect(),
        Expr::col((P::Table, NavidromePlaylists::Uri))
            .eq(uri)
            .and(Expr::col((P::Table, NavidromePlaylists::UserId)).eq(user_id)),
    );

    let playlist: Option<PlaylistRow> = sql::fetch_optional(pool, &stmt).await?;
    with_tracks(db, playlist, user_id).await
}

/// Loads the entries for a playlist row, whichever way it was looked up.
async fn with_tracks(
    db: &Db,
    playlist: Option<PlaylistRow>,
    user_id: &str,
) -> Result<Option<(PlaylistRow, Vec<TrackWithUpload>)>, Error> {
    let pool = db.primary();
    let playlist = match playlist {
        Some(p) => p,
        None => return Ok(None),
    };

    // Reuse the canonical track projection (includes BYO-storage columns) so the
    // row deserializes into TrackWithUpload correctly.
    let mut stmt = track_select(user_id);
    stmt.join_as(
        JoinType::Join,
        NavidromePlaylistTracks::Table,
        Npt::Table,
        Expr::col((Npt::Table, NavidromePlaylistTracks::TrackId))
            .equals((Tracks::Table, Tracks::XataId)),
    )
    .and_where(Expr::col((Npt::Table, NavidromePlaylistTracks::PlaylistId)).eq(&playlist.xata_id))
    .order_by(
        (Npt::Table, NavidromePlaylistTracks::XataCreatedat),
        Order::Asc,
    );

    let tracks: Vec<TrackWithUpload> = sql::fetch_all(pool, &stmt).await?;

    Ok(Some((playlist, tracks)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_query::{PostgresQueryBuilder, SqliteQueryBuilder};
    use sea_query_binder::SqlxBinder;

    #[test]
    fn an_empty_playlist_reports_zero_rather_than_null() {
        let (sql, values) = playlist_select(
            Dialect::Postgres,
            Expr::col((P::Table, NavidromePlaylists::UserId)).eq("u"),
        )
        .build_sqlx(PostgresQueryBuilder);
        assert!(sql.contains(r#"CAST(COALESCE((SELECT SUM("t"."duration")"#));
        // An empty playlist's mosaic aggregates to NULL; the COALESCE makes it
        // an empty JSON array, which reads back as an empty list. The fallback
        // is a bound value, not inlined text, so it is checked among the
        // values rather than in the SQL.
        assert!(sql.contains(r#") AS "track_arts""#), "{sql}");
        assert!(
            values.0 .0.iter().any(|v| matches!(
                v,
                sea_query::Value::String(Some(s)) if s.as_str() == "[]"
            )),
            "the empty-mosaic fallback must be an empty JSON array"
        );
    }

    /// The mosaic takes four covers in the order the tracks carrying them were
    /// added — the aggregate's own ORDER BY, not the subquery's.
    #[test]
    fn the_cover_mosaic_is_ordered_and_capped() {
        let (sql, values) = playlist_select(
            Dialect::Postgres,
            Expr::col((P::Table, NavidromePlaylists::Uri)).eq("at://x"),
        )
        .build_sqlx(PostgresQueryBuilder);
        assert!(sql.contains(r#"array_agg("art" ORDER BY "added_at")"#));
        assert!(values
            .0
             .0
            .iter()
            .any(|v| matches!(v, sea_query::Value::BigUnsigned(Some(4)))));
    }

    /// The same query on SQLite. This is what the dual-backend support comes
    /// down to: `array_agg` and `text[]` do not exist here, so the mosaic is
    /// aggregated with `json_group_array` instead — and both spellings have to
    /// produce JSON text, because that is the only form the row struct can
    /// decode from both.
    #[test]
    fn the_mosaic_aggregates_to_json_on_sqlite_too() {
        let (pg, _) = playlist_select(
            Dialect::Postgres,
            Expr::col((P::Table, NavidromePlaylists::UserId)).eq("u"),
        )
        .build_sqlx(PostgresQueryBuilder);
        let (lite, _) = playlist_select(
            Dialect::Sqlite,
            Expr::col((P::Table, NavidromePlaylists::UserId)).eq("u"),
        )
        .build_sqlx(SqliteQueryBuilder);

        assert!(pg.contains("to_json"), "Postgres must cast to JSON: {pg}");
        assert!(
            lite.contains("json_group_array"),
            "SQLite has no array_agg: {lite}"
        );
        assert!(
            !lite.contains("array_agg") && !lite.contains("text[]"),
            "no Postgres-only construct may reach SQLite: {lite}"
        );

        // And the placeholders follow the dialect, which is the other half of
        // running one statement against two backends.
        assert!(lite.contains('?') && !lite.contains("$1"), "{lite}");
        assert!(pg.contains("$1"), "{pg}");
    }
}
