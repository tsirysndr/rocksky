use anyhow::Error;

pub async fn sync() -> Result<(), Error> {
    rocksky_analytics::sync().await?;
    Ok(())
}

pub async fn serve() -> Result<(), Error> {
    rocksky_analytics::serve().await?;
    Ok(())
}
