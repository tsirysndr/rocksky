use anyhow::Error;

pub async fn start_tracklist_service() -> Result<(), Error> {
    rocksky_tracklist::run().await?;
    Ok(())
}
