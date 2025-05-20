use sqlx::{Pool, Postgres};
use anyhow::Error;
use crate::xata::spotify_account::SpotifyAccount;

pub async fn get_spotify_account(pool: &Pool<Postgres>, user_id: &str) -> Result<Option<SpotifyAccount>, Error> {
    let results: Vec<SpotifyAccount> = sqlx::query_as(r#"
        SELECT * FROM spotify_accounts
        WHERE user_id = $1
    "#)
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    if results.len() == 0 {
        return Ok(None);
    }

    Ok(Some(results[0].clone()))
}
