use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::user::UserWithApiKey;

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
