use anyhow::Error;

pub async fn scan() -> Result<(), Error> {
    rocksky_googledrive::cmd::scan::scan().await?;
    Ok(())
}

pub async fn serve() -> Result<(), Error> {
    rocksky_googledrive::cmd::serve::serve().await?;
    Ok(())
}
