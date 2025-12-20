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
      LEFT JOIN spotify_apps ON spotify_tokens.spotify_app_id = spotify_apps.spotify_app_id
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

pub async fn get_spotify_tokens(
    pool: &Pool<Postgres>,
    limit: u32,
) -> Result<Vec<SpotifyToken>, Error> {
    let results: Vec<SpotifyToken> = sqlx::query_as(
        r#"
    SELECT * FROM spotify_tokens
    LEFT JOIN spotify_accounts ON spotify_tokens.user_id = spotify_accounts.user_id
    LEFT JOIN users ON spotify_accounts.user_id = users.xata_id
    LEFT JOIN spotify_apps ON spotify_tokens.spotify_app_id = spotify_apps.spotify_app_id
    WHERE spotify_accounts.is_beta_user = true
    LIMIT $1
  "#,
    )
    .bind(limit as i32)
    .fetch_all(pool)
    .await?;

    Ok(results)
}
