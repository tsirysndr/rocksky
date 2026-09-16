use anyhow::Error;

use crate::xata::user::UserWithApiKey;
use rocksky_pgurl::Db;

pub async fn get_user_did_by_id(db: &Db, user_id: &str) -> Result<Option<String>, Error> {
    let pool = db.primary();
    let row: Option<(String,)> = sqlx::query_as(r#"SELECT did FROM users WHERE xata_id = $1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(did,)| did))
}

/// Resolve a user by handle without requiring an API key.
///
/// Used by the internal (server-to-server) auth path: apps/api has already
/// authenticated the caller via a Rocksky JWT, so we trust the handle and skip
/// Subsonic credential verification. `api_key` is returned empty since it is
/// irrelevant on this path.
pub async fn get_user_by_handle(db: &Db, handle: &str) -> Result<Option<UserWithApiKey>, Error> {
    let pool = db.primary();
    let row: Option<UserWithApiKey> = sqlx::query_as(
        r#"
        SELECT
            xata_id,
            handle,
            display_name,
            avatar,
            '' AS api_key
        FROM users
        WHERE handle = $1
        "#,
    )
    .bind(handle)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub async fn get_user_with_apikeys(db: &Db, handle: &str) -> Result<Vec<UserWithApiKey>, Error> {
    let pool = db.primary();
    let rows: Vec<UserWithApiKey> = sqlx::query_as(
        r#"
        SELECT
            users.xata_id,
            users.handle,
            users.display_name,
            users.avatar,
            api_keys.api_key
        FROM users
        JOIN api_keys ON users.xata_id = api_keys.user_id
        WHERE users.handle = $1
          AND api_keys.enabled = true
        "#,
    )
    .bind(handle)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}
