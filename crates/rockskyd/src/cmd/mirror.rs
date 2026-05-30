use anyhow::Error;

pub async fn start_mirror_service() -> Result<(), Error> {
    rocksky_mirror::run().await?;
    Ok(())
}
