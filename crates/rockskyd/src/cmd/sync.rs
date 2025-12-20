use anyhow::Error;

pub async fn start_sync_service() -> Result<(), Error> {
    rocksky_sync::run().await?;
    Ok(())
}
