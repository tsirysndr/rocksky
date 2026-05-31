//! Fetch a profile and recent scrobbles.
//!
//! ```text
//! cargo run --example quickstart -- alice.bsky.social
//! ```

use rocksky::{Client, Error};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let handle = std::env::args().nth(1).unwrap_or_else(|| "tsiry.dev".into());

    let client = Client::new();

    let profile = match client.actor().get_profile(&handle).await {
        Ok(p) => p,
        Err(e) if e.is_not_found() => {
            eprintln!("no profile for {handle:?}");
            std::process::exit(1);
        }
        Err(Error::Api { status: 400, .. }) => {
            eprintln!("invalid handle {handle:?}");
            std::process::exit(1);
        }
        Err(e) => return Err(e.into()),
    };

    println!(
        "{}  ({})",
        profile
            .display_name
            .clone()
            .or_else(|| profile.handle.clone())
            .unwrap_or_else(|| "—".into()),
        profile.did.clone().unwrap_or_else(|| "—".into())
    );
    if let Some(ts) = profile.created_at {
        println!("  joined: {ts}");
    }
    println!();

    let Some(did) = profile.did.clone() else {
        eprintln!("(profile has no DID, can't list scrobbles)");
        return Ok(());
    };

    let scrobbles = client.scrobble().list().did(did).limit(10).send().await?;
    if scrobbles.is_empty() {
        println!("(no scrobbles yet)");
        return Ok(());
    }

    println!("recent scrobbles:");
    for s in scrobbles {
        let when = s
            .date
            .map(|d| d.to_rfc3339())
            .unwrap_or_else(|| "—".into());
        println!(
            "  [{when}]  {} — {}",
            s.artist.unwrap_or_else(|| "?".into()),
            s.title.unwrap_or_else(|| "?".into())
        );
    }
    Ok(())
}
