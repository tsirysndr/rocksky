use anyhow::Error;

pub async fn start_scrobbler_service() -> Result<(), Error> {
    rocksky_scrobbler::run().await?;
    Ok(())
}
