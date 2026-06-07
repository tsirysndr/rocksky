//! Fetch the latest scrobble per user, optionally filtered by feed or
//! restricted to people the viewer follows.
//!
//! ```text
//! cargo run --example stories
//! cargo run --example stories -- metalcore
//! ROCKSKY_TOKEN=... cargo run --example stories -- following
//! ```

use rocksky::Client;

const METALCORE: &str =
    "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/metalcore";
const TRAP: &str = "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/trap";
const SYNTHWAVE: &str =
    "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/synthwave";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mode = std::env::args().nth(1).unwrap_or_else(|| "recent".into());

    let client = match std::env::var("ROCKSKY_TOKEN") {
        Ok(token) => Client::builder().token(token).build(),
        Err(_) => Client::new(),
    };

    let feed = client.feed();
    let mut req = feed.stories().size(10);
    match mode.as_str() {
        "metalcore" => req = req.feed(METALCORE),
        "trap" => req = req.feed(TRAP),
        "synthwave" => req = req.feed(SYNTHWAVE),
        "following" => req = req.following(true),
        _ => {}
    }

    let stories = req.send().await?;
    for s in &stories {
        println!(
            "@{:<24} {} — {}",
            s.handle.clone().unwrap_or_else(|| "?".into()),
            s.artist.clone().unwrap_or_else(|| "?".into()),
            s.title.clone().unwrap_or_else(|| "?".into()),
        );
    }
    eprintln!("\n{} stories", stories.len());
    Ok(())
}
