use std::env;

use subscriber::ScrobbleSubscriber;
use dotenv::dotenv;

pub mod subscriber;
pub mod types;
pub mod xata;
pub mod repo;
pub mod profile;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    dotenv()?;
    let jetstream_server = env::var("JETSTREAM_SERVER").unwrap_or_else(|_| "wss://jetstream2.us-east.bsky.network".to_string());
    let url = format!("{}/subscribe?wantedCollections=app.rocksky.*", jetstream_server);
    let subscriber = ScrobbleSubscriber::new(&url);

    subscriber.run().await?;
    Ok(())
}
