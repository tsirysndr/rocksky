//! Run a full-text search and stream hits as one JSON object per line —
//! pipe-friendly, drop-in for `jq`.
//!
//! ```text
//! cargo run --example search -- "kate bush" | jq -c '{type:.type,title:.title // .name}'
//! ```

use rocksky::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let query = std::env::args()
        .skip(1)
        .collect::<Vec<_>>()
        .join(" ");
    if query.is_empty() {
        eprintln!("usage: search <query>");
        std::process::exit(1);
    }

    let client = Client::new();
    let results = client.feed().search(&query).await?;

    if let Some(total) = results.estimated_total_hits {
        eprintln!(
            "~{total} hit(s) in {} ms",
            results.processing_time_ms.unwrap_or_default()
        );
    }

    for hit in results.hits {
        // One JSON object per line — works with shell pipelines.
        println!("{}", serde_json::to_string(&hit)?);
    }
    Ok(())
}
