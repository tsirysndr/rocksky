#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    rocksky_matching::startup::run().await
}
