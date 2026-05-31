//! Pretty-print someone's Wrapped year-in-review payload.
//!
//! ```text
//! cargo run --example wrapped -- did:plc:abc... [2025]
//! ```

use rocksky::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let Some(did) = args.next() else {
        eprintln!("usage: wrapped <did-or-handle> [year]");
        std::process::exit(1);
    };
    let year = args.next().and_then(|s| s.parse::<i32>().ok());

    let client = Client::new();
    let wrapped = client.stats().wrapped(&did, year).await?;

    println!("{}", serde_json::to_string_pretty(&wrapped)?);
    Ok(())
}
