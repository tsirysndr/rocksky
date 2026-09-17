use anyhow::Error;
use chrono::{DateTime, Utc};
use rocksky_db::models::json_array;
use rocksky_db::Dialect;
use sea_query::{ColumnDef, Expr, OnConflict, Query, SimpleExpr, Table};

use crate::schema::NavidromePlayQueues;
use crate::sql;
use rocksky_db::Handle as Db;

pub struct PlayQueue {
    pub user_id: String,
    pub track_ids: Vec<String>,
    pub current_track_id: Option<String>,
    pub position_ms: i64,
    pub changed_at: DateTime<Utc>,
    pub changed_by: String,
}

/// The stored form of a track-id list, for the backend in use.
///
/// Postgres binds a real array; SQLite binds the JSON text that
/// [`json_array`] reads back. Both round-trip through `track_ids`.
fn track_ids_value(dialect: Dialect, track_ids: &[String]) -> SimpleExpr {
    match dialect {
        Dialect::Postgres => track_ids.to_vec().into(),
        // `unwrap_or` rather than `?`: a list of strings cannot fail to
        // serialise, and an empty array is the right answer if it somehow did.
        Dialect::Sqlite => serde_json::to_string(track_ids)
            .unwrap_or_else(|_| "[]".to_string())
            .into(),
    }
}

/// `NOW()` has no SQLite spelling; the text form matches what the column holds.
fn now(dialect: Dialect) -> SimpleExpr {
    match dialect {
        Dialect::Postgres => Expr::cust("NOW()"),
        Dialect::Sqlite => rocksky_db::now_timestamp().into(),
    }
}

pub async fn ensure_table(db: &Db) -> Result<(), Error> {
    let pool = db.primary();
    let dialect = pool.dialect();
    let ddl = Table::create()
        .table(NavidromePlayQueues::Table)
        .if_not_exists()
        .col(
            ColumnDef::new(NavidromePlayQueues::UserId)
                .text()
                .not_null()
                .primary_key(),
        )
        // A list of ids, stored as whatever the backend can hold: a real
        // `TEXT[]` on Postgres — which is what the deployed table already is,
        // so nothing has to be migrated — and a JSON array in TEXT on SQLite,
        // which has no array type. `track_ids_expr` and `track_ids_of` are the
        // two ends of that, and the only places the difference appears.
        .col(match dialect {
            Dialect::Postgres => ColumnDef::new(NavidromePlayQueues::TrackIds)
                .custom(sea_query::Alias::new("TEXT[]"))
                .not_null()
                .default(Expr::cust("'{}'"))
                .take(),
            Dialect::Sqlite => ColumnDef::new(NavidromePlayQueues::TrackIds)
                .text()
                .not_null()
                .default("[]")
                .take(),
        })
        .col(ColumnDef::new(NavidromePlayQueues::CurrentTrackId).text())
        .col(
            ColumnDef::new(NavidromePlayQueues::PositionMs)
                .big_integer()
                .not_null()
                .default(0),
        )
        .col(match dialect {
            Dialect::Postgres => ColumnDef::new(NavidromePlayQueues::ChangedAt)
                .timestamp_with_time_zone()
                .not_null()
                .default(Expr::cust("NOW()"))
                .take(),
            // SQLite keeps timestamps as ISO-8601 text, in the format
            // `rocksky_db::format_timestamp` writes and its decoder reads.
            Dialect::Sqlite => ColumnDef::new(NavidromePlayQueues::ChangedAt)
                .text()
                .not_null()
                .default(Expr::cust("(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"))
                .take(),
        })
        .col(
            ColumnDef::new(NavidromePlayQueues::ChangedBy)
                .text()
                .not_null()
                .default(""),
        )
        .take();

    sql::execute_schema(pool, sql::schema_builder(pool).build(&ddl)).await?;
    Ok(())
}

pub async fn get_play_queue(db: &Db, user_id: &str) -> Result<Option<PlayQueue>, Error> {
    let pool = db.primary();
    let stmt = Query::select()
        .column(NavidromePlayQueues::UserId)
        // Read as JSON text whichever backend it is, because `Vec<String>`
        // decodes from neither: sqlx has no `text[]` decoder for Postgres, and
        // SQLite has no array type to decode from.
        .expr_as(
            pool.text_array(NavidromePlayQueues::TrackIds),
            sea_query::Alias::new("track_ids"),
        )
        .columns([
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
        Option<String>,
        Option<String>,
        i64,
        DateTime<Utc>,
        String,
    )> = sql::fetch_optional(pool, &stmt).await?;

    Ok(row.map(
        |(user_id, track_ids, current_track_id, position_ms, changed_at, changed_by)| PlayQueue {
            user_id,
            track_ids: json_array(track_ids.as_deref()),
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
            track_ids_value(pool.dialect(), track_ids),
            current_track_id.map(str::to_string).into(),
            position_ms.into(),
            now(pool.dialect()),
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

#[cfg(test)]
mod tests {
    use super::*;

    /// The play queue on SQLite: the table this service creates for itself, a
    /// list of ids round-tripping through it, and the `NOW()` default that has
    /// no SQLite spelling. All three were Postgres-only.
    #[tokio::test]
    async fn a_queue_round_trips_on_sqlite() {
        let db = rocksky_db::connect_in_memory().await.unwrap();
        let handle = rocksky_db::Handle::from_backend(db);

        ensure_table(&handle).await.unwrap();
        assert!(
            get_play_queue(&handle, "rec_alice")
                .await
                .unwrap()
                .is_none(),
            "nothing saved yet"
        );

        save_play_queue(
            &handle,
            "rec_alice",
            &["tr_1".into(), "tr_2".into(), "tr_3".into()],
            Some("tr_2"),
            42_000,
            "subsonic",
        )
        .await
        .unwrap();

        let queue = get_play_queue(&handle, "rec_alice")
            .await
            .unwrap()
            .expect("saved");
        assert_eq!(queue.track_ids, vec!["tr_1", "tr_2", "tr_3"]);
        assert_eq!(queue.current_track_id.as_deref(), Some("tr_2"));
        assert_eq!(queue.position_ms, 42_000);
        assert_eq!(queue.changed_by, "subsonic");

        // Saving again replaces rather than duplicating — the upsert's
        // ON CONFLICT, which has to work on both backends.
        save_play_queue(&handle, "rec_alice", &["tr_9".into()], None, 0, "web")
            .await
            .unwrap();
        let queue = get_play_queue(&handle, "rec_alice")
            .await
            .unwrap()
            .expect("saved");
        assert_eq!(queue.track_ids, vec!["tr_9"]);
        assert_eq!(queue.current_track_id, None);

        // An empty queue is an empty list, not a NULL or a parse failure.
        save_play_queue(&handle, "rec_alice", &[], None, 0, "web")
            .await
            .unwrap();
        assert!(get_play_queue(&handle, "rec_alice")
            .await
            .unwrap()
            .expect("saved")
            .track_ids
            .is_empty());
    }
}
