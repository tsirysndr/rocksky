use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct User {
    pub xata_id: String,
    pub display_name: Option<String>,
    pub did: String,
    pub handle: String,
    pub avatar: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    #[sqlx(try_from = "rocksky_db::timestamp::UtcTimestamp")]
    pub xata_createdat: DateTime<Utc>,
}

impl User {
    pub fn avatar(&self) -> &str {
        self.avatar.as_deref().unwrap_or("")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(user: User, populated: bool) {
        assert_eq!(
            user.display_name.as_deref(),
            if populated { Some("Alice") } else { None }
        );
        assert_eq!(
            user.avatar(),
            if populated {
                "https://example.test/avatar"
            } else {
                ""
            }
        );
        assert_eq!(
            user.xata_createdat.to_rfc3339(),
            "2026-01-02T03:04:05+00:00"
        );
    }

    fn query(populated: bool, timestamp: &str) -> String {
        let (name, avatar) = if populated {
            ("'Alice'", "'https://example.test/avatar'")
        } else {
            ("NULL", "NULL")
        };
        format!("SELECT 'id' AS xata_id, 'did:plc:example' AS did, 'alice.test' AS handle, {name} AS display_name, {avatar} AS avatar, {timestamp} AS xata_createdat")
    }

    #[tokio::test]
    async fn nullable_profiles_on_sqlite() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        for populated in [false, true] {
            let user = sqlx::query_as(&query(populated, "'2026-01-02T03:04:05Z'"))
                .fetch_one(&pool)
                .await
                .unwrap();
            check(user, populated);
        }
    }

    #[tokio::test]
    #[ignore = "requires ROCKSKY_TEST_POSTGRES_URL; performs read-only queries"]
    async fn nullable_profiles_on_postgres() {
        let url = std::env::var("ROCKSKY_TEST_POSTGRES_URL").unwrap();
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        for timestamp in [
            "TIMESTAMP '2026-01-02 03:04:05'",
            "TIMESTAMPTZ '2026-01-02 06:04:05+03'",
        ] {
            for populated in [false, true] {
                let user = sqlx::query_as(&query(populated, timestamp))
                    .fetch_one(&pool)
                    .await
                    .unwrap();
                check(user, populated);
            }
        }
    }
}
