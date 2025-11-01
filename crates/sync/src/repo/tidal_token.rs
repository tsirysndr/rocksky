use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::tidal_token::TidalToken;

pub async fn list(
    pool: &Pool<Postgres>,
    offset: u32,
    limit: u32,
) -> Result<Vec<TidalToken>, Error> {
    let results: Vec<TidalToken> = sqlx::query_as(
        "
      SELECT * FROM tidal_tokens
      LEFT JOIN users ON tidal_tokens.user_id = users.xata_id
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
