//! playerd — Rocksky remote player daemon.
//!
//! Registers as a device on the Rocksky remote-control WebSocket, so it shows
//! up in the web/desktop miniplayer device picker and plays whatever gets
//! sent to it through the local rockbox-playback engine.

mod config;
mod engine;
mod remote;
mod resolver;
mod settings;

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use clap::Parser;
use rocksky_sdk::{RemotePlayer, RemotePlayerConfig};
use tracing_subscriber::EnvFilter;

use crate::config::Config;
use crate::engine::{Engine, EngineCmd};
use crate::remote::Shared;
use crate::resolver::Resolver;

#[derive(Parser)]
#[command(name = "playerd", version, about = "Rocksky remote player daemon")]
struct Cli {
    /// Audio files or directories to queue and play at startup
    paths: Vec<PathBuf>,
    /// TOML config file (default: ~/.rocksky/playerd.toml)
    #[arg(short, long, env = "PLAYERD_CONFIG")]
    config: Option<PathBuf>,
    /// Device name shown in the miniplayer picker (default: hostname)
    #[arg(short, long, env = "PLAYERD_NAME")]
    name: Option<String>,
    /// Remote-control WebSocket URL
    #[arg(long, env = "PLAYERD_WS_URL")]
    ws_url: Option<String>,
    /// Rocksky API base URL
    #[arg(long, env = "PLAYERD_API_URL")]
    api_url: Option<String>,
    /// Access token (default: ~/.rocksky/token.json from `rocksky login`)
    #[arg(long, env = "ROCKSKY_TOKEN", hide_env_values = true)]
    token: Option<String>,
    /// Audio output backend: cpal | stdout | fifo:PATH | unix:PATH | tcp:ADDR
    #[arg(short, long, env = "PLAYERD_OUTPUT")]
    output: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "playerd=info".into()),
        )
        .init();

    let cli = Cli::parse();
    let mut config = Config::load(cli.config.as_deref())?;
    if let Some(name) = &cli.name {
        config.name = name.clone();
    }
    if let Some(ws_url) = cli.ws_url.clone().or_else(|| std::env::var("ROCKSKY_WS").ok()) {
        config.ws_url = ws_url;
    }
    if let Some(api_url) = &cli.api_url {
        config.api_url = api_url.clone();
    }
    if let Some(output) = &cli.output {
        config.output = output.clone();
    }
    let token = config.resolve_token(cli.token.clone())?;
    let name = config.effective_name();

    let (uris, items) = resolver::scan_local(&cli.paths)?;

    let player_config = config.player_config()?;
    let audio_baseline = settings::Baseline::from_player_config(&player_config);
    let engine = Arc::new(Engine::start(player_config).map_err(|e| anyhow!(e))?);

    if config.sync_audio_settings {
        tokio::spawn(settings::sync_loop(
            engine.clone(),
            audio_baseline,
            config.api_url.trim_end_matches('/').to_string(),
            token.clone(),
            std::time::Duration::from_secs(config.audio_settings_refresh_seconds.max(5)),
        ));
    }

    tracing::info!("registering \"{name}\" on {}", config.ws_url);
    let remote = Arc::new(RemotePlayer::connect(
        RemotePlayerConfig::new(token.clone(), name).url(config.ws_url.clone()),
    ));

    let shared = Arc::new(Shared::new(engine, remote.clone()));

    if !uris.is_empty() {
        tracing::info!("queueing {} local track(s)", uris.len());
        *shared.queue_meta.lock().unwrap() = items;
        shared.engine.send(EngineCmd::OpenAt {
            paths: uris,
            start_index: 0,
            shuffle: config.shuffle,
        });
    }

    tokio::spawn(remote::command_loop(
        shared.clone(),
        Resolver::new(&config, token),
    ));
    tokio::spawn(remote::status_loop(shared.clone()));
    tokio::spawn(async move {
        loop {
            if let Some(id) = remote.device_id() {
                tracing::info!("registered as device {id}");
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    });

    tokio::signal::ctrl_c().await?;
    tracing::info!("shutting down");
    shared.remote.disconnect();
    Ok(())
}
