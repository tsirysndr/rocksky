use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::spotify_token::SpotifyToken;

pub async fn list(
    pool: &Pool<Postgres>,
    offset: u32,
    limit: u32,
) -> Result<Vec<SpotifyToken>, Error> {
    let results: Vec<SpotifyToken> = sqlx::query_as(
        "
      SELECT * FROM spotify_tokens
      LEFT JOIN users ON spotify_tokens.user_id = users.xata_id
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
