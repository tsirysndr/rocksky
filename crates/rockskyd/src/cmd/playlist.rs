use anyhow::Error;

pub async fn start_playlist_service() -> Result<(), Error> {
    rocksky_playlists::start().await?;
    Ok(())
}
