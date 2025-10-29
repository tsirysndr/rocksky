use crate::xata::spotify_account::SpotifyAccount;
use anyhow::Error;
use sqlx::{Pool, Postgres};

pub async fn get_spotify_account(
    pool: &Pool<Postgres>,
    user_id: &str,
) -> Result<Option<SpotifyAccount>, Error> {
    let results: Vec<SpotifyAccount> = sqlx::query_as(
        r#"
        SELECT * FROM spotify_accounts
        LEFT JOIN spotify_apps ON spotify_accounts.spotify_app_id = spotify_apps.spotify_app_id
        WHERE user_id = $1
    "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    if results.len() == 0 {
        return Ok(None);
    }

    Ok(Some(results[0].clone()))
}
