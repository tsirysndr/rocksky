//! Standalone ingestion worker, deployable independently of the application API.
use serde::Deserialize;

#[derive(Default, Deserialize)]
struct Config {
    #[serde(default)]
    telemetry: rocksky_telemetry::Settings,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv::dotenv().ok();
    let settings = match std::env::var("ROCKSKY_CONFIG") {
        Ok(path) => toml::from_str::<Config>(&std::fs::read_to_string(path)?)?.telemetry,
        Err(std::env::VarError::NotPresent) => Config::default().telemetry,
        Err(error) => return Err(error.into()),
    };
    let _telemetry = rocksky_telemetry::init("rocksky-jetstream", &settings)?;
    rocksky_jetstream::subscribe().await
}
