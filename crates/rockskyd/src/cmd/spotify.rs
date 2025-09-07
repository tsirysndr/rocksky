use anyhow::Error;

pub async fn start_spotify_service() -> Result<(), Error> {
    rocksky_spotify::run().await?;
    Ok(())
}
