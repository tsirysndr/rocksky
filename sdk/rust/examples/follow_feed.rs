//! Page through the authenticated user's "following" scrobble feed.
//!
//! ```text
//! ROCKSKY_TOKEN=... cargo run --example follow_feed -- 50
//! ```

use rocksky::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let total = std::env::args()
        .nth(1)
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(20);

    let Ok(token) = std::env::var("ROCKSKY_TOKEN") else {
        eprintln!("set $ROCKSKY_TOKEN first");
        std::process::exit(1);
    };
    let client = Client::builder().token(token).build();

    let page = 20;
    let mut fetched = 0u32;
    let mut offset = 0u32;

    while fetched < total {
        let want = (total - fetched).min(page);
        let scrobbles = client
            .scrobble()
            .list()
            .following(true)
            .limit(want)
            .offset(offset)
            .send()
            .await?;
        if scrobbles.is_empty() {
            break;
        }
        for s in &scrobbles {
            let when = s
                .date
                .map(|d| d.to_rfc3339())
                .unwrap_or_else(|| "—".into());
            println!(
                "[{when}] {} — {} (by {})",
                s.artist.clone().unwrap_or_else(|| "?".into()),
                s.title.clone().unwrap_or_else(|| "?".into()),
                s.user.clone().unwrap_or_else(|| "?".into()),
            );
        }
        let got = scrobbles.len() as u32;
        fetched += got;
        offset += got;
        if got < want {
            break;
        }
    }
    eprintln!("\nfetched {fetched} scrobble(s)");
    Ok(())
}
