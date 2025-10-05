use anyhow::Error;

pub async fn pull_data() -> Result<(), Error> {
    rocksky_pgpull::pull_data().await
}
