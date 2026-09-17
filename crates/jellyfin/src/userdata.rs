//! Per-user, per-item playback state.
//!
//! `IsFavorite` is not stored here — it maps onto `loved_tracks`, the same
//! table the Subsonic service stars into and the same one that drives the
//! ATProto like record. What is left (play count, played flag, resume
//! position, thumb rating) has no home in the Rocksky schema, so it lives in a
//! sidecar keyed by (user, native id).

use anyhow::Error;
use chrono::{DateTime, Utc};
use rocksky_db::Handle as Db;
use rocksky_navidrome::schema::LovedTracks;
use rocksky_navidrome::sql;
use sea_query::{ColumnDef, Expr, OnConflict, Order, PostgresQueryBuilder, Query, Table};

use crate::schema::JellyfinUserItemData as Data;

#[derive(Debug, Default, Clone, sqlx::FromRow)]
pub struct ItemUserData {
    pub playback_position_ticks: i64,
    pub play_count: i32,
    pub played: bool,
    pub likes: Option<bool>,
    pub rating: Option<f64>,
    pub last_played_date: Option<DateTime<Utc>>,
}

/// The columns [`ItemUserData`] decodes from, in its field order.
const DATA_COLUMNS: [Data; 6] = [
    Data::PlaybackPositionTicks,
    Data::PlayCount,
    Data::Played,
    Data::Likes,
    Data::Rating,
    Data::LastPlayedDate,
];

pub async fn ensure_table(db: &Db) -> Result<(), Error> {
    let pool = db.primary();
    let ddl = Table::create()
        .table(Data::Table)
        .if_not_exists()
        .col(ColumnDef::new(Data::UserId).text().not_null())
        .col(ColumnDef::new(Data::ItemId).text().not_null())
        .col(
            ColumnDef::new(Data::PlaybackPositionTicks)
                .big_integer()
                .not_null()
                .default(0i64),
        )
        .col(
            ColumnDef::new(Data::PlayCount)
                .integer()
                .not_null()
                .default(0),
        )
        .col(
            ColumnDef::new(Data::Played)
                .boolean()
                .not_null()
                .default(false),
        )
        .col(ColumnDef::new(Data::Likes).boolean())
        .col(ColumnDef::new(Data::Rating).double())
        .col(ColumnDef::new(Data::LastPlayedDate).timestamp_with_time_zone())
        .primary_key(
            sea_query::Index::create()
                .col(Data::UserId)
                .col(Data::ItemId),
        )
        .build(PostgresQueryBuilder);

    sql::execute_schema(pool, ddl).await?;
    Ok(())
}

pub async fn get(db: &Db, user_id: &str, item_id: &str) -> ItemUserData {
    let pool = db.primary();
    let stmt = Query::select()
        .columns(DATA_COLUMNS)
        .from(Data::Table)
        .and_where(Expr::col(Data::UserId).eq(user_id))
        .and_where(Expr::col(Data::ItemId).eq(item_id))
        .take();

    sql::fetch_optional(pool, &stmt)
        .await
        .unwrap_or(None)
        .unwrap_or_default()
}

/// Fetch a whole page's worth in one query. A listing otherwise costs one round
/// trip per row before any JSON is written.
pub async fn get_many(
    db: &Db,
    user_id: &str,
    item_ids: &[String],
) -> std::collections::HashMap<String, ItemUserData> {
    let pool = db.primary();
    if item_ids.is_empty() {
        return Default::default();
    }
    let stmt = Query::select()
        .column(Data::ItemId)
        .columns(DATA_COLUMNS)
        .from(Data::Table)
        .and_where(Expr::col(Data::UserId).eq(user_id))
        .and_where(Expr::col(Data::ItemId).is_in(item_ids.to_vec()))
        .take();

    let rows: Vec<(
        String,
        i64,
        i32,
        bool,
        Option<bool>,
        Option<f64>,
        Option<DateTime<Utc>>,
    )> = sql::fetch_all(pool, &stmt).await.unwrap_or_default();

    rows.into_iter()
        .map(|(id, ticks, count, played, likes, rating, last)| {
            (
                id,
                ItemUserData {
                    playback_position_ticks: ticks,
                    play_count: count,
                    played,
                    likes,
                    rating,
                    last_played_date: last,
                },
            )
        })
        .collect()
}

/// Items the user stopped part-way through and hasn't since finished — the
/// "continue listening" rail. Most recently played first.
pub async fn resume_items(db: &Db, user_id: &str, limit: i64) -> Vec<String> {
    let pool = db.primary();
    let stmt = Query::select()
        .column(Data::ItemId)
        .from(Data::Table)
        .and_where(Expr::col(Data::UserId).eq(user_id))
        .and_where(Expr::col(Data::PlaybackPositionTicks).gt(0))
        .and_where(Expr::col(Data::Played).eq(false))
        .order_by_with_nulls(
            Data::LastPlayedDate,
            Order::Desc,
            sea_query::NullOrdering::Last,
        )
        .order_by(Data::ItemId, Order::Asc)
        .limit(limit.max(0) as u64)
        .take();

    sql::fetch_scalars(pool, &stmt).await.unwrap_or_default()
}

/// Which of `track_ids` the user has starred. One query for a whole page.
pub async fn favorites_among(
    db: &Db,
    user_id: &str,
    track_ids: &[String],
) -> std::collections::HashSet<String> {
    let pool = db.primary();
    if track_ids.is_empty() {
        return Default::default();
    }
    let stmt = Query::select()
        .column(LovedTracks::TrackId)
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::UserId).eq(user_id))
        .and_where(Expr::col(LovedTracks::TrackId).is_in(track_ids.to_vec()))
        .take();

    sql::fetch_scalars::<String>(pool, &stmt)
        .await
        .unwrap_or_default()
        .into_iter()
        .collect()
}

pub async fn set_position(db: &Db, user_id: &str, item_id: &str, ticks: i64) -> Result<(), Error> {
    upsert(
        db.primary(),
        user_id,
        item_id,
        Data::PlaybackPositionTicks,
        ticks,
    )
    .await
}

pub async fn set_played(
    db: &Db,
    user_id: &str,
    item_id: &str,
    played: bool,
    at: Option<DateTime<Utc>>,
) -> Result<(), Error> {
    let pool = db.primary();
    // Marking played bumps the count and stamps the date; un-marking clears
    // both, which is what the reference server does for `DELETE
    // /UserPlayedItems/{id}`.
    let stmt = if played {
        let when = || sea_query::Func::coalesce([Expr::val(at).into(), Expr::cust("NOW()")]);
        Query::insert()
            .into_table(Data::Table)
            .columns([
                Data::UserId,
                Data::ItemId,
                Data::Played,
                Data::PlayCount,
                Data::LastPlayedDate,
            ])
            .values_panic([
                user_id.into(),
                item_id.into(),
                Expr::cust("TRUE"),
                Expr::val(1).into(),
                when().into(),
            ])
            .on_conflict(
                OnConflict::columns([Data::UserId, Data::ItemId])
                    .value(Data::Played, Expr::cust("TRUE"))
                    .value(
                        Data::PlayCount,
                        Expr::col((Data::Table, Data::PlayCount)).add(1),
                    )
                    .value(Data::LastPlayedDate, when())
                    .to_owned(),
            )
            .to_owned()
    } else {
        Query::insert()
            .into_table(Data::Table)
            .columns([
                Data::UserId,
                Data::ItemId,
                Data::Played,
                Data::PlayCount,
                Data::LastPlayedDate,
            ])
            .values_panic([
                user_id.into(),
                item_id.into(),
                Expr::cust("FALSE"),
                Expr::val(0).into(),
                Expr::cust("NULL"),
            ])
            .on_conflict(
                OnConflict::columns([Data::UserId, Data::ItemId])
                    .value(Data::Played, Expr::cust("FALSE"))
                    .value(Data::PlayCount, Expr::val(0))
                    .value(Data::LastPlayedDate, Expr::cust("NULL"))
                    .to_owned(),
            )
            .to_owned()
    };

    sql::execute(pool, &stmt).await?;
    Ok(())
}

pub async fn set_likes(
    db: &Db,
    user_id: &str,
    item_id: &str,
    likes: Option<bool>,
) -> Result<(), Error> {
    upsert(db.primary(), user_id, item_id, Data::Likes, likes).await
}

pub async fn set_play_count(
    db: &Db,
    user_id: &str,
    item_id: &str,
    count: i32,
) -> Result<(), Error> {
    upsert(db.primary(), user_id, item_id, Data::PlayCount, count).await
}

pub async fn set_rating(
    db: &Db,
    user_id: &str,
    item_id: &str,
    rating: Option<f64>,
) -> Result<(), Error> {
    upsert(db.primary(), user_id, item_id, Data::Rating, rating).await
}

pub async fn set_played_flag(
    db: &Db,
    user_id: &str,
    item_id: &str,
    played: bool,
) -> Result<(), Error> {
    upsert(db.primary(), user_id, item_id, Data::Played, played).await
}

pub async fn set_last_played(
    db: &Db,
    user_id: &str,
    item_id: &str,
    at: Option<DateTime<Utc>>,
) -> Result<(), Error> {
    upsert(db.primary(), user_id, item_id, Data::LastPlayedDate, at).await
}

/// Upsert one column. `column` is a [`Data`] variant, so — unlike the string it
/// used to be — it cannot name anything that isn't a column of this table.
async fn upsert<T>(
    pool: &rocksky_db::Backend,
    user_id: &str,
    item_id: &str,
    column: Data,
    value: T,
) -> Result<(), Error>
where
    T: Into<sea_query::Value>,
{
    let stmt = Query::insert()
        .into_table(Data::Table)
        .columns([Data::UserId, Data::ItemId, column])
        .values_panic([user_id.into(), item_id.into(), Expr::val(value).into()])
        .on_conflict(
            OnConflict::columns([Data::UserId, Data::ItemId])
                .update_column(column)
                .to_owned(),
        )
        .to_owned();

    sql::execute(pool, &stmt).await?;
    Ok(())
}
