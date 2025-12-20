use std::env;

use anyhow::Error;
use sqlx::postgres::PgPoolOptions;

pub mod cache;
pub mod clients;
pub mod crypto;
pub mod lastfm;
pub mod repo;
pub mod rocksky;
pub mod search;
pub mod spotify;
pub mod tidal;
pub mod token;
pub mod types;
pub mod xata;

const MAX_CONNECTIONS: u32 = 5;

pub async fn run() -> Result<(), Error> {
    let pool = PgPoolOptions::new()
        .max_connections(MAX_CONNECTIONS)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    lastfm::start(pool.clone()).await?;
    spotify::start(pool.clone()).await?;
    tidal::start(pool.clone()).await?;

    Ok(())
}
