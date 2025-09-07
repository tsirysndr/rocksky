use anyhow::Error;

pub async fn scan() -> Result<(), Error> {
    rocksky_dropbox::cmd::scan::scan().await?;
    Ok(())
}

pub async fn serve() -> Result<(), Error> {
    rocksky_dropbox::cmd::serve::serve().await?;
    Ok(())
}
