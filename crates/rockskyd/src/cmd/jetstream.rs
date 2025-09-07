use anyhow::Error;

pub async fn start_jetstream_service() -> Result<(), Error> {
    rocksky_jetstream::subscribe().await?;
    Ok(())
}
