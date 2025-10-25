use std::env;

use anyhow::Error;
use sqlx::postgres::PgPoolOptions;

pub mod clients;
pub mod crypto;
pub mod lastfm;
pub mod repo;
pub mod spotify;
pub mod tidal;
pub mod types;
pub mod xata;

const MAX_CONNECTIONS: u32 = 5;

pub async fn run() -> Result<(), Error> {
    let pool = PgPoolOptions::new()
        .max_connections(MAX_CONNECTIONS)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let client = redis::Client::open(env::var("REDIS_URL").unwrap_or("redis://127.0.0.1".into()))?;

    lastfm::start(pool.clone(), client.clone()).await?;
    spotify::start(pool.clone(), client.clone()).await?;
    tidal::start(pool.clone(), client.clone()).await?;

    Ok(())
}
