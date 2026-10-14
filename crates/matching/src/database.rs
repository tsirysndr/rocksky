//! Matching reads only. Never open the primary or run catalog migrations.
use anyhow::{ensure, Result};
use rocksky_db::Backend;
use sqlx::{
    postgres::{PgConnectOptions, PgPoolOptions},
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use std::{str::FromStr, time::Duration};

pub fn selected_url(read_url: Option<String>, explicit_url: Option<String>) -> Option<String> {
    read_url
        .filter(|s| !s.trim().is_empty())
        .or_else(|| explicit_url.filter(|s| !s.trim().is_empty()))
}
pub async fn connect_read_only(url: &str) -> Result<Backend> {
    if url.starts_with("postgres:") || url.starts_with("postgresql:") {
        let options = PgConnectOptions::from_str(url)?
            .application_name("rocksky-matching:replica")
            .options([
                ("default_transaction_read_only", "on"),
                ("statement_timeout", "7000"),
            ]);
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(5))
            .connect_with(options)
            .await?;
        let read_only: String = sqlx::query_scalar("SHOW transaction_read_only")
            .fetch_one(&pool)
            .await?;
        ensure!(
            read_only == "on",
            "matching requires read-only PostgreSQL sessions"
        );
        Ok(Backend::Postgres {
            primary: pool,
            replica: None,
        })
    } else {
        ensure!(
            url.starts_with("sqlite:"),
            "matching database URL must use postgres or sqlite"
        );
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(SqliteConnectOptions::from_str(url)?.read_only(true))
            .await?;
        Ok(Backend::Sqlite(pool))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn read_endpoint_wins() {
        assert_eq!(
            selected_url(Some("read".into()), Some("other".into())).as_deref(),
            Some("read")
        );
    }
    #[test]
    fn explicit_endpoint_is_supported() {
        assert_eq!(
            selected_url(None, Some("explicit".into())).as_deref(),
            Some("explicit")
        );
    }
    #[test]
    fn blank_endpoints_do_not_enable_database() {
        assert!(selected_url(Some(" ".into()), None).is_none());
    }
}
