use dotenv::dotenv;
use server::serve;

pub mod handlers;
pub mod server;
pub mod types;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    serve().await?;
    Ok(())
}
