use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::spotify_account::SpotifyAccount;

pub async fn get_spotify_account(
    pool: &Pool<Postgres>,
    did: &str,
) -> Result<Option<SpotifyAccount>, Error> {
    let results: Vec<SpotifyAccount> = sqlx::query_as(
        r#"
    SELECT * FROM spotify_accounts
    LEFT JOIN users ON spotify_accounts.user_id = users.xata_id
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
