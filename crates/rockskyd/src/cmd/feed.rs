use anyhow::Error;
use rocksky_feed::repo::{duckdb::DuckdbRepo, RepoImpl};

pub async fn serve(enable_sync: bool) -> Result<(), Error> {
    rocksky_feed::run(enable_sync).await?;
    Ok(())
}

pub async fn sync() -> Result<(), Error> {
    rocksky_feed::sync::sync_scrobbles(RepoImpl::Duckdb(DuckdbRepo::new().await?)).await
}
