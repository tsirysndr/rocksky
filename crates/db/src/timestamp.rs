//! Compatibility decoding for UTC timestamps in legacy row models.
//!
//! Xata uses TIMESTAMPTZ, while local Drizzle schemas use TIMESTAMP containing
//! UTC. Decode the latter explicitly as UTC, independent of the session zone.
use chrono::{DateTime, NaiveDateTime, Utc};
use sqlx::{decode::Decode, error::BoxDynError, Postgres, Sqlite, Type, ValueRef};

#[derive(Debug)]
pub struct UtcTimestamp(pub DateTime<Utc>);

impl From<UtcTimestamp> for DateTime<Utc> {
    fn from(value: UtcTimestamp) -> Self {
        value.0
    }
}

impl Type<Postgres> for UtcTimestamp {
    fn type_info() -> sqlx::postgres::PgTypeInfo {
        <DateTime<Utc> as Type<Postgres>>::type_info()
    }

    fn compatible(ty: &sqlx::postgres::PgTypeInfo) -> bool {
        <DateTime<Utc> as Type<Postgres>>::compatible(ty)
            || <NaiveDateTime as Type<Postgres>>::compatible(ty)
    }
}

impl<'r> Decode<'r, Postgres> for UtcTimestamp {
    fn decode(value: sqlx::postgres::PgValueRef<'r>) -> Result<Self, BoxDynError> {
        if <NaiveDateTime as Type<Postgres>>::compatible(&value.type_info()) {
            Ok(Self(
                <NaiveDateTime as Decode<Postgres>>::decode(value)?.and_utc(),
            ))
        } else {
            Ok(Self(<DateTime<Utc> as Decode<Postgres>>::decode(value)?))
        }
    }
}

impl Type<Sqlite> for UtcTimestamp {
    fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
        <DateTime<Utc> as Type<Sqlite>>::type_info()
    }

    fn compatible(ty: &sqlx::sqlite::SqliteTypeInfo) -> bool {
        <DateTime<Utc> as Type<Sqlite>>::compatible(ty)
    }
}

impl<'r> Decode<'r, Sqlite> for UtcTimestamp {
    fn decode(value: sqlx::sqlite::SqliteValueRef<'r>) -> Result<Self, BoxDynError> {
        Ok(Self(<DateTime<Utc> as Decode<Sqlite>>::decode(value)?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, sqlx::FromRow)]
    struct Row {
        #[sqlx(try_from = "UtcTimestamp")]
        at: DateTime<Utc>,
    }

    #[tokio::test]
    async fn sqlite_timestamp_compatibility() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        let row: Row = sqlx::query_as("SELECT '2026-01-02T03:04:05Z' AS at")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.at.to_rfc3339(), "2026-01-02T03:04:05+00:00");
    }

    #[tokio::test]
    #[ignore = "requires ROCKSKY_TEST_POSTGRES_URL; performs read-only queries"]
    async fn postgres_timestamp_compatibility() {
        let url = std::env::var("ROCKSKY_TEST_POSTGRES_URL").unwrap();
        let mut conn = <sqlx::PgConnection as sqlx::Connection>::connect(&url)
            .await
            .unwrap();
        sqlx::query("SET TIME ZONE 'Indian/Antananarivo'")
            .execute(&mut conn)
            .await
            .unwrap();
        for (expression, expected) in [
            (
                "TIMESTAMP '2026-01-02 03:04:05'",
                "2026-01-02T03:04:05+00:00",
            ),
            (
                "TIMESTAMPTZ '2026-01-02 03:04:05+03'",
                "2026-01-02T00:04:05+00:00",
            ),
        ] {
            let row: Row = sqlx::query_as(&format!("SELECT {expression} AS at"))
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(row.at.to_rfc3339(), expected);
        }
        assert!(sqlx::query_as::<_, Row>("SELECT 42 AS at")
            .fetch_one(&mut conn)
            .await
            .is_err());
    }
}
