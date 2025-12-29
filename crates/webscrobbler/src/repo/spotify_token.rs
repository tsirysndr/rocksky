use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::spotify_token::SpotifyToken;

pub async fn get_spotify_token(
    pool: &Pool<Postgres>,
    did: &str,
) -> Result<Option<SpotifyToken>, Error> {
    let results: Vec<SpotifyToken> = sqlx::query_as(
        r#"
    SELECT * FROM spotify_tokens
    LEFT JOIN spotify_accounts ON spotify_tokens.user_id = spotify_accounts.user_id
    LEFT JOIN users ON spotify_accounts.user_id = users.xata_id
    LEFT JOIN spotify_apps ON spotify_tokens.spotify_app_id = spotify_apps.spotify_app_id
    WHERE users.did = $1
  "#,
    )
    .bind(did)
    .fetch_all(pool)
    .await?;

    if results.len() == 0 {
        return Ok(None);
    }

    Ok(Some(results[0].clone()))
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
    WHERE is_beta_user = true
    LIMIT $1
  "#,
    )
    .bind(limit as i32)
    .fetch_all(pool)
    .await?;

    Ok(results)
}
