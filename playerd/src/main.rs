//! playerd — Rocksky remote player daemon.
//!
//! Registers as a device on the Rocksky remote-control WebSocket, so it shows
//! up in the web/desktop miniplayer device picker and plays whatever gets
//! sent to it through the local rockbox-playback engine.

mod analysis;
mod autodj;
mod config;
mod engine;
mod mcp;
mod remote;
mod resolver;
mod resume;
mod scrobble;
mod settings;

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand};
use rocksky_sdk::{RemotePlayer, RemotePlayerConfig};
use tracing_subscriber::EnvFilter;

use crate::config::Config;
use crate::engine::{Engine, EngineCmd};
use crate::remote::Shared;
use crate::resolver::Resolver;

#[derive(Parser)]
#[command(name = "playerd", version, about = "Rocksky remote player daemon")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
    /// Audio files or directories to queue and play at startup
    paths: Vec<PathBuf>,
    /// TOML config file (default: ~/.rocksky/playerd.toml)
    #[arg(short, long, env = "PLAYERD_CONFIG", global = true)]
    config: Option<PathBuf>,
    /// Device name shown in the miniplayer picker (default: hostname)
    #[arg(short, long, env = "PLAYERD_NAME")]
    name: Option<String>,
    /// Remote-control WebSocket URL
    #[arg(long, env = "PLAYERD_WS_URL", global = true)]
    ws_url: Option<String>,
    /// Rocksky API base URL
    #[arg(long, env = "PLAYERD_API_URL", global = true)]
    api_url: Option<String>,
    /// Access token (default: ~/.rocksky/token.json from `rocksky login`)
    #[arg(long, env = "ROCKSKY_TOKEN", hide_env_values = true, global = true)]
    token: Option<String>,
    /// Audio output backend: cpal | stdout | fifo:PATH | unix:PATH | tcp:ADDR
    #[arg(short, long, env = "PLAYERD_OUTPUT")]
    output: Option<String>,
}

#[derive(Subcommand)]
enum Command {
    /// Run a Model Context Protocol server on stdio, so an AI agent can drive
    /// your Rocksky players
    Mcp,
    /// Analyse local audio files — loudness, music edges, tempo, key, energy
    /// — and print the result. This is what Auto DJ reads.
    Analyze {
        /// Audio files (or directories) to analyse
        #[arg(required = true)]
        paths: Vec<PathBuf>,
        /// Print the raw JSON instead of a summary
        #[arg(long)]
        json: bool,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let mcp_mode = matches!(cli.command, Some(Command::Mcp));

    // Always stderr: stdout belongs to whatever the invocation put there —
    // the MCP protocol under `playerd mcp`, raw PCM under `-o stdout`. Logs
    // interleaved into either one corrupt it.
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "playerd=info".into()),
        )
        .with_writer(std::io::stderr)
        .init();

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
    // Analysing local files needs neither an account nor a network.
    if let Some(Command::Analyze { paths, json }) = &cli.command {
        return analyze_files(&config, paths, *json).await;
    }

    let token = config.resolve_token(cli.token.clone())?;
    let name = config.effective_name();

    // The MCP server is a controller, not a player: it needs the token and the
    // endpoints, but no audio engine, no queue and no scrobbler.
    if mcp_mode {
        tracing::info!("starting MCP server on stdio");
        return mcp::run(config, token).await;
    }

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

    let cache = analysis::cache::AnalysisCache::open(&config.analysis_db_path()).await?;
    match cache.prune(config.autodj.cache_entries).await {
        Ok(0) => {}
        Ok(dropped) => tracing::debug!("pruned {dropped} analysis cache row(s)"),
        Err(e) => tracing::warn!("could not prune the analysis cache: {e:#}"),
    }
    tracing::info!("analysis cache: {} track(s)", cache.len().await);
    let autodj = Arc::new(autodj::AutoDj::new(&config, cache));
    let settings_sync = Arc::new(settings::SettingsSync::new(audio_baseline, autodj.clone()));

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

    tokio::spawn(autodj::run(shared.clone(), autodj));
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

/// `playerd analyze` — run the Auto DJ analysis over local files and print it.
/// Results land in the same cache the daemon reads, so analysing an album up
/// front means Auto DJ has nothing left to compute when it plays.
async fn analyze_files(config: &Config, paths: &[PathBuf], json: bool) -> Result<()> {
    let (uris, _) = resolver::scan_local(paths)?;
    if uris.is_empty() {
        return Err(anyhow!("no playable audio in the given paths"));
    }
    let cache = analysis::cache::AnalysisCache::open(&config.analysis_db_path()).await?;

    for uri in uris {
        let path = PathBuf::from(&uri);
        let hint = path
            .extension()
            .map(|e| e.to_string_lossy().into_owned())
            .unwrap_or_default();
        let bytes = std::fs::read(&path).with_context(|| format!("reading {uri}"))?;
        let target = config.autodj.target_lufs as f64;
        let analyzed =
            tokio::task::spawn_blocking(move || analysis::analyze(bytes, Some(&hint), target))
                .await?;

        match analyzed {
            Ok(analysis) => {
                if let Err(e) = cache.put(&uri, &analysis).await {
                    tracing::warn!("could not cache {uri}: {e:#}");
                }
                if json {
                    println!("{}", serde_json::to_string_pretty(&analysis)?);
                } else {
                    println!("{}\n{}\n", path.display(), analysis::summary(&analysis));
                }
            }
            Err(e) => tracing::warn!("{uri}: {e:#}"),
        }
    }
    Ok(())
}
