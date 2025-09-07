use anyhow::Error;
use std::env;

use subscriber::ScrobbleSubscriber;

pub mod profile;
pub mod repo;
pub mod subscriber;
pub mod types;
pub mod xata;

pub async fn subscribe() -> Result<(), Error> {
    let jetstream_server = env::var("JETSTREAM_SERVER")
        .unwrap_or_else(|_| "wss://jetstream2.us-west.bsky.network".to_string());
    let url = format!(
        "{}/subscribe?wantedCollections=app.rocksky.*",
        jetstream_server
    );
    let subscriber = ScrobbleSubscriber::new(&url);

    subscriber.run().await?;

    Ok(())
}
