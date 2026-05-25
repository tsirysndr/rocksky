use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::user::UserWithApiKey;

pub async fn get_user_did_by_id(
    pool: &Pool<Postgres>,
    user_id: &str,
) -> Result<Option<String>, Error> {
    let row: Option<(String,)> = sqlx::query_as(r#"SELECT did FROM users WHERE xata_id = $1"#)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(did,)| did))
}

pub async fn get_user_with_apikeys(
    pool: &Pool<Postgres>,
    handle: &str,
) -> Result<Vec<UserWithApiKey>, Error> {
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
