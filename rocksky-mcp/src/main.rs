//! rocksky-mcp — a Model Context Protocol server for Rocksky, on stdio.
//!
//! This is what `rocksky mcp` runs. It gives an agent three planes through one
//! server:
//!
//! - [`tools::player`] — every player online for the account, over the same
//!   remote-control WebSocket the web and desktop miniplayers speak. It is a
//!   *controller*, not a player: the agent can run on a laptop and still start
//!   music on the amp in the living room.
//! - [`tools::library`] — the listener's library through Rocksky's
//!   Subsonic-compatible (Navidrome) API, which is where playable ids come
//!   from.
//! - [`tools::insights`] — the Rocksky AppView XRPC surface: who the listener
//!   is, what they play, what the platform is playing, API keys.
//!
//! Plus [`tools::audio`], which shapes how a running player sounds.

mod config;
mod creds;
mod protocol;
mod rocksky;
mod server;
mod settings;
mod state;
mod subsonic;
mod tools;

use anyhow::Result;
use clap::{Parser, Subcommand};
use tracing_subscriber::EnvFilter;

use crate::config::Config;

#[derive(Parser)]
#[command(
    name = "rocksky-mcp",
    version,
    about = "Model Context Protocol server for Rocksky — players, library and AppView on stdio"
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
    /// Rocksky API base URL, for pointing at a development server
    #[arg(long, env = "ROCKSKY_API_URL", global = true)]
    api_url: Option<String>,
    /// Remote-control WebSocket URL, for pointing at a development server
    #[arg(long, env = "ROCKSKY_WS_URL", global = true)]
    ws_url: Option<String>,
    /// Access token (default: ~/.rocksky/token.json from `rocksky login`)
    #[arg(long, env = "ROCKSKY_TOKEN", hide_env_values = true, global = true)]
    token: Option<String>,
    /// Where the access token lives
    #[arg(
        long,
        env = "ROCKSKY_TOKEN_PATH",
        default_value = "~/.rocksky/token.json",
        global = true
    )]
    token_path: String,
    /// Player the command tools address when a call does not name one
    #[arg(long, env = "ROCKSKY_MCP_DEVICE", global = true)]
    device: Option<String>,
}

#[derive(Subcommand)]
enum Command {
    /// Print the tool definitions as JSON and exit — what `tools/list` would
    /// answer, without needing a token or a client.
    Tools,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // stdout carries protocol frames and nothing else; a stray log line there
    // is a parse error at the other end.
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_env("ROCKSKY_MCP_LOG").unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();

    if matches!(cli.command, Some(Command::Tools)) {
        let definitions = serde_json::json!({ "tools": tools::definitions() });
        println!("{}", serde_json::to_string_pretty(&definitions)?);
        return Ok(());
    }

    // Unset flags mean the hosted Rocksky: api.rocksky.app and its remote-control
    // socket. Nothing has to be configured for the common case.
    let defaults = Config::default();
    let config = Config {
        api_url: cli.api_url.unwrap_or(defaults.api_url),
        ws_url: cli.ws_url.unwrap_or(defaults.ws_url),
        device: cli.device.filter(|d| !d.trim().is_empty()),
    };
    let token = config::resolve_token(cli.token, &cli.token_path)?;

    server::run(config, token).await
}
