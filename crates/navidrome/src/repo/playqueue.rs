use anyhow::Error;
use chrono::{DateTime, Utc};
use sea_query::{ColumnDef, Expr, OnConflict, PostgresQueryBuilder, Query, Table};

use crate::schema::NavidromePlayQueues;
use crate::sql;
use rocksky_pgurl::Db;

pub struct PlayQueue {
    pub user_id: String,
    pub track_ids: Vec<String>,
    pub current_track_id: Option<String>,
    pub position_ms: i64,
    pub changed_at: DateTime<Utc>,
    pub changed_by: String,
}

pub async fn ensure_table(db: &Db) -> Result<(), Error> {
    let pool = db.primary();
    let ddl = Table::create()
        .table(NavidromePlayQueues::Table)
        .if_not_exists()
        .col(
            ColumnDef::new(NavidromePlayQueues::UserId)
                .text()
                .not_null()
                .primary_key(),
        )
        .col(
            ColumnDef::new(NavidromePlayQueues::TrackIds)
                .custom(sea_query::Alias::new("TEXT[]"))
                .not_null()
                .default(Expr::cust("'{}'")),
        )
        .col(ColumnDef::new(NavidromePlayQueues::CurrentTrackId).text())
        .col(
            ColumnDef::new(NavidromePlayQueues::PositionMs)
                .big_integer()
                .not_null()
                .default(0),
        )
        .col(
            ColumnDef::new(NavidromePlayQueues::ChangedAt)
                .timestamp_with_time_zone()
                .not_null()
                .default(Expr::cust("NOW()")),
        )
        .col(
            ColumnDef::new(NavidromePlayQueues::ChangedBy)
                .text()
                .not_null()
                .default(""),
        )
        .build(PostgresQueryBuilder);

    sql::execute_schema(pool, ddl).await?;
    Ok(())
}

pub async fn get_play_queue(db: &Db, user_id: &str) -> Result<Option<PlayQueue>, Error> {
    let pool = db.primary();
    let stmt = Query::select()
        .columns([
            NavidromePlayQueues::UserId,
            NavidromePlayQueues::TrackIds,
            NavidromePlayQueues::CurrentTrackId,
            NavidromePlayQueues::PositionMs,
            NavidromePlayQueues::ChangedAt,
            NavidromePlayQueues::ChangedBy,
        ])
        .from(NavidromePlayQueues::Table)
        .and_where(Expr::col(NavidromePlayQueues::UserId).eq(user_id))
        .take();

    let row: Option<(
        String,
        Vec<String>,
        Option<String>,
        i64,
        DateTime<Utc>,
        String,
    )> = sql::fetch_optional(pool, &stmt).await?;

    Ok(row.map(
        |(user_id, track_ids, current_track_id, position_ms, changed_at, changed_by)| PlayQueue {
            user_id,
            track_ids,
            current_track_id,
            position_ms,
            changed_at,
            changed_by,
        },
    ))
}

pub async fn save_play_queue(
    db: &Db,
    user_id: &str,
    track_ids: &[String],
    current_track_id: Option<&str>,
    position_ms: i64,
    changed_by: &str,
) -> Result<(), Error> {
    let pool = db.primary();
    let stmt = Query::insert()
        .into_table(NavidromePlayQueues::Table)
        .columns([
            NavidromePlayQueues::UserId,
            NavidromePlayQueues::TrackIds,
            NavidromePlayQueues::CurrentTrackId,
            NavidromePlayQueues::PositionMs,
            NavidromePlayQueues::ChangedAt,
            NavidromePlayQueues::ChangedBy,
        ])
        .values_panic([
            user_id.into(),
            track_ids.to_vec().into(),
            current_track_id.map(str::to_string).into(),
            position_ms.into(),
            Expr::cust("NOW()"),
            changed_by.into(),
        ])
        .on_conflict(
            OnConflict::column(NavidromePlayQueues::UserId)
                .update_columns([
                    NavidromePlayQueues::TrackIds,
                    NavidromePlayQueues::CurrentTrackId,
                    NavidromePlayQueues::PositionMs,
                    NavidromePlayQueues::ChangedAt,
                    NavidromePlayQueues::ChangedBy,
                ])
                .to_owned(),
        )
        .to_owned();

    sql::execute(pool, &stmt).await?;
    Ok(())
}
