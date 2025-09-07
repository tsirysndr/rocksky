use anyhow::Error;

pub async fn start_webscrobbler_service() -> Result<(), Error> {
    rocksky_webscrobbler::start_server().await?;
    Ok(())
}
