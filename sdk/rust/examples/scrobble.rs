//! Submit a scrobble.
//!
//! Reads the bearer token from `$ROCKSKY_TOKEN`. Override the API base URL
//! with `$ROCKSKY_BASE_URL` for self-hosted instances.
//!
//! ```text
//! ROCKSKY_TOKEN=... cargo run --example scrobble
//! ```

use std::time::{SystemTime, UNIX_EPOCH};

use rocksky::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let token = match std::env::var("ROCKSKY_TOKEN") {
        Ok(t) => t,
        Err(_) => {
            eprintln!("set $ROCKSKY_TOKEN first");
            std::process::exit(1);
        }
    };
    let base_url = std::env::var("ROCKSKY_BASE_URL").unwrap_or_else(|_| "https://api.rocksky.app".into());

    let client = Client::builder().base_url(base_url).token(token).build();

    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;

    let result = client
        .scrobble()
        .create("Hounds of Love", "Kate Bush")
        .album("Hounds of Love")
        .duration(298_000)
        .year(1985)
        .timestamp(now)
        .send()
        .await?;

    println!("scrobble accepted: {result}");
    Ok(())
}
