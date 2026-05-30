//! DB helpers — connecting + loading rows.

use anyhow::{Context, Error};
use chrono::{DateTime, Utc};
use sqlx::{postgres::PgPoolOptions, FromRow, Pool, Postgres};
use std::{env, time::Duration};

use crate::Provider;

pub async fn connect() -> Result<Pool<Postgres>, Error> {
    let url = env::var("XATA_POSTGRES_URL").context("XATA_POSTGRES_URL not set")?;
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(12))
        .max_lifetime(Some(Duration::from_secs(60 * 14)))
        .test_before_acquire(true)
        .connect(&url)
        .await?;
    Ok(pool)
}

/// Joined view of `mirror_sources` + user DID.
#[derive(Debug, Clone, FromRow)]
pub struct MirrorSourceRow {
    pub user_id: String,
    pub did: String,
    pub provider: String,
    pub enabled: bool,
    pub external_username: Option<String>,
    pub encrypted_api_key: Option<String>,
    pub last_scrobble_seen_at: Option<DateTime<Utc>>,
}

pub async fn load_enabled(
    pool: &Pool<Postgres>,
    provider: Provider,
) -> Result<Vec<MirrorSourceRow>, Error> {
    let rows = sqlx::query_as::<_, MirrorSourceRow>(
        r#"
        SELECT
            m.user_id            AS user_id,
            u.did                AS did,
            m.provider           AS provider,
            m.enabled            AS enabled,
            m.external_username  AS external_username,
            m.encrypted_api_key  AS encrypted_api_key,
            m.last_scrobble_seen_at AS last_scrobble_seen_at
        FROM mirror_sources m
        JOIN users u ON u.xata_id = m.user_id
        WHERE m.enabled = TRUE AND m.provider = $1
        "#,
    )
    .bind(provider.as_str())
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn load_one(
    pool: &Pool<Postgres>,
    user_id: &str,
    provider: Provider,
) -> Result<Option<MirrorSourceRow>, Error> {
    let row = sqlx::query_as::<_, MirrorSourceRow>(
        r#"
        SELECT
            m.user_id            AS user_id,
            u.did                AS did,
            m.provider           AS provider,
            m.enabled            AS enabled,
            m.external_username  AS external_username,
            m.encrypted_api_key  AS encrypted_api_key,
            m.last_scrobble_seen_at AS last_scrobble_seen_at
        FROM mirror_sources m
        JOIN users u ON u.xata_id = m.user_id
        WHERE m.user_id = $1 AND m.provider = $2
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(provider.as_str())
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn user_id_for_did(pool: &Pool<Postgres>, did: &str) -> Result<Option<String>, Error> {
    let row: Option<(String,)> =
        sqlx::query_as(r#"SELECT xata_id FROM users WHERE did = $1 LIMIT 1"#)
            .bind(did)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|(id,)| id))
}

pub async fn touch_polled(
    pool: &Pool<Postgres>,
    user_id: &str,
    provider: Provider,
    last_scrobble_seen_at: Option<DateTime<Utc>>,
) -> Result<(), Error> {
    sqlx::query(
        r#"
        UPDATE mirror_sources
        SET last_polled_at = NOW(),
            last_scrobble_seen_at = COALESCE($3, last_scrobble_seen_at),
            xata_updatedat = NOW()
        WHERE user_id = $1 AND provider = $2
        "#,
    )
    .bind(user_id)
    .bind(provider.as_str())
    .bind(last_scrobble_seen_at)
    .execute(pool)
    .await?;
    Ok(())
}
