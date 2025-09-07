pub mod handlers;
pub mod queue;
pub mod server;
pub mod types;

use anyhow::Error;

pub async fn run() -> Result<(), Error> {
    server::run().await?;
    Ok(())
}
