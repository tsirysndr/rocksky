use anyhow::Error;

pub async fn start_navidrome_service() -> Result<(), Error> {
    rocksky_navidrome::run().await?;
    Ok(())
}
