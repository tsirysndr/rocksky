use anyhow::Error;

pub async fn serve() -> Result<(), Error> {
    rocksky_feed::run().await;
    Ok(())
}
