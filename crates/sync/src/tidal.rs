use std::env;

use anyhow::Error;
use redis::Client;
use sqlx::{Pool, Postgres};

use crate::{clients::tidal::TidalClient, repo};

pub async fn start(pool: Pool<Postgres>, _client: Client) -> Result<(), Error> {
    let max = env::var("MAX_USERS")
        .unwrap_or("100".into())
        .parse::<u32>()
        .unwrap_or(100);
    let offset = env::var("OFFSET_USERS")
        .unwrap_or("0".into())
        .parse::<u32>()
        .unwrap_or(0);
    let users = repo::tidal_token::list(&pool, offset, max).await?;
    for user in users {
        let refresh_token = crate::crypto::decrypt_aes_256_ctr(
            &user.refresh_token,
            &hex::decode(env::var("SPOTIFY_ENCRYPTION_KEY")?)?,
        )?;
        TidalClient::new(&refresh_token);
    }
    Ok(())
}
