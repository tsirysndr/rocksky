pub async fn start_matching_service() -> anyhow::Result<()> {
    rocksky_matching::startup::run().await
}
