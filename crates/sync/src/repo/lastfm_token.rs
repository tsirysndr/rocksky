use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::lastfm_token::LastfmToken;

pub async fn list(
    pool: &Pool<Postgres>,
    offset: u32,
    limit: u32,
) -> Result<Vec<LastfmToken>, Error> {
    let results: Vec<LastfmToken> = sqlx::query_as(
        "
        SELECT * FROM lastfm_tokens
        LEFT JOIN users ON lastfm_tokens.user_id = users.xata_id
        OFFSET $1
        LIMIT $2
    ",
    )
    .bind(offset as i64)
    .bind(limit as i64)
    .fetch_all(pool)
    .await?;

    Ok(results)
}
