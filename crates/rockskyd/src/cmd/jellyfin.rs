use anyhow::Error;

pub async fn start_jellyfin_service() -> Result<(), Error> {
    rocksky_jellyfin::run().await?;
    Ok(())
}
