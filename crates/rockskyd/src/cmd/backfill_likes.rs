use anyhow::Error;

pub async fn backfill_likes() -> Result<(), Error> {
    rocksky_jetstream::backfill::run().await
}
