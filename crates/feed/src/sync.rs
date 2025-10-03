use std::env;

use anyhow::Error;
use sqlx::postgres::PgPoolOptions;

use crate::repo::{duckdb::DuckdbRepo, Repo, RepoImpl};

pub async fn sync_scrobbles() -> Result<(), Error> {
    tracing::info!("Starting scrobble synchronization...");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let repo = RepoImpl::Duckdb(DuckdbRepo::new().await?);
    repo.create_tables().await?;

    Ok(())
}
