use anyhow::Error;
use dotenv::dotenv;
use rocksky_webscrobbler::start_server;

#[tokio::main]
async fn main() -> Result<(), Error> {
    dotenv().ok();

    start_server().await?;

    Ok(())
}
