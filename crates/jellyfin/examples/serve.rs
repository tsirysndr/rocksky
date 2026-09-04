//! Run the Jellyfin API on its own: `cargo run -p rocksky-jellyfin --example serve`.
//!
//! The `rockskyd` binary links every service in the workspace, DuckDB included,
//! which makes it awkward to start just this one while debugging.

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();
    dotenv::dotenv().ok();
    rocksky_jellyfin::run().await
}
