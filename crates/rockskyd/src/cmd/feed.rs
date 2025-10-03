use anyhow::Error;

pub async fn serve() -> Result<(), Error> {
    rocksky_feed::run().await?;
    Ok(())
}

pub async fn sync() -> Result<(), Error> {
    rocksky_feed::sync::sync_scrobbles().await
}
