//! playerd — Rocksky remote player daemon.
//!
//! Registers as a device on the Rocksky remote-control WebSocket, so it shows
//! up in the web/desktop miniplayer device picker and plays whatever gets
//! sent to it through the local rockbox-playback engine.

mod config;
mod engine;
mod remote;
mod resolver;
mod resume;
mod scrobble;
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
    if let Some(ws_url) = cli
        .ws_url
        .clone()
        .or_else(|| std::env::var("ROCKSKY_WS").ok())
    {
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

    let mut player_config = config.player_config()?;
    if let Some(spec) = config
        .equalizer
        .preset
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let spec = settings::PresetSpec::parse(spec)?;
        let http = reqwest::Client::new();
        let api_url = config.api_url.trim_end_matches('/');
        match settings::fetch_preset(&http, api_url, &token, &spec).await {
            Ok((preset_name, equalizer)) => {
                tracing::info!("loaded equalizer preset \"{preset_name}\"");
                player_config.dsp.equalizer = equalizer;
            }
            Err(e) => tracing::warn!("equalizer preset not applied: {e:#}"),
        }
    }
    let audio_baseline = settings::Baseline::from_player_config(&player_config);
    let engine = Arc::new(Engine::start(player_config).map_err(|e| anyhow!(e))?);
    let settings_sync = Arc::new(settings::SettingsSync::new(audio_baseline));

    if config.sync_audio_settings {
        tokio::spawn(settings::sync(
            engine.clone(),
            settings_sync.clone(),
            config.api_url.trim_end_matches('/').to_string(),
            token.clone(),
            config.jetstream_urls.clone(),
        ));
    }

    tracing::info!("registering \"{name}\" on {}", config.ws_url);
    let remote = Arc::new(RemotePlayer::connect(
        RemotePlayerConfig::new(token.clone(), name).url(config.ws_url.clone()),
    ));

    let sidecar_path = config.resume.then(|| config.resume_sidecar_path());
    let transport_path = config.resume.then(|| config.transport_state_path());
    let shared = Arc::new(Shared::new(
        engine,
        remote.clone(),
        settings_sync,
        sidecar_path,
        transport_path,
    ));
    // Before any queueing: an explicit local-files invocation below still
    // applies its own shuffle via OpenAt, and Resume never touches either.
    shared.restore_transport();

    if !uris.is_empty() {
        // Explicit paths win over a restore: the user asked for these.
        tracing::info!("queueing {} local track(s)", uris.len());
        shared.remember_uris(uris.iter().cloned().zip(items.iter().cloned()));
        shared.engine.send(EngineCmd::OpenAt {
            paths: uris,
            start_index: 0,
            shuffle: config.shuffle,
        });
    } else if config.resume {
        let mut resolver = Resolver::new(&config, token.clone());
        match resume::restore(
            &config.resume_file_path(),
            &config.resume_sidecar_path(),
            &mut resolver,
        )
        .await
        {
            Some(restored) => {
                tracing::info!(
                    "resuming {} track(s) at #{} ({}s in)",
                    restored.items.len(),
                    restored.index,
                    restored.elapsed_ms / 1000
                );
                // Re-record: the URIs are freshly minted, so the sidecar's old
                // keys no longer match what the engine is about to persist.
                shared.remember_uris(
                    restored
                        .uris
                        .iter()
                        .cloned()
                        .zip(restored.items.iter().cloned()),
                );
                // Cued paused — a daemon that started blaring music on boot
                // would be a surprise, and a controller is one tap away.
                shared.engine.send(EngineCmd::Resume);
            }
            None => tracing::debug!("no queue to resume"),
        }
    }

    if config.scrobble {
        tokio::spawn(scrobble::scrobble_loop(
            shared.clone(),
            config.api_url.trim_end_matches('/').to_string(),
            token.clone(),
        ));
    } else {
        tracing::info!("scrobbling disabled by config");
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
