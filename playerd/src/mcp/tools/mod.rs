//! The tool surface: everything an agent can do to a Rocksky player.
//!
//! Tools are grouped by what they touch — [`player`] drives transport and the
//! queue, [`library`] finds music to put in it, [`audio`] shapes how it sounds
//! — and every one of them is a thin wrapper over the same remote-control
//! protocol the web and desktop miniplayers speak, so anything the agent does
//! here is visible (and reversible) from any other Rocksky client.

pub mod audio;
pub mod autodj;
pub mod library;
pub mod player;

use std::sync::Arc;

use anyhow::{anyhow, Context as _, Result};
use serde_json::{json, Value};
use tokio::sync::OnceCell;

use crate::analysis::cache::AnalysisCache;
use crate::config::Config;
use crate::mcp::analyzer::Analyzer;
use crate::mcp::rocksky::{Me, Rocksky};
use crate::mcp::state::Player;
use crate::mcp::subsonic::Subsonic;

/// How long to wait after a transport command before reading the state back.
/// playerd re-pushes ~150 ms after applying one; the rest is the round trip.
pub const SETTLE_MS: u64 = 700;
/// Enqueues have to resolve stream URLs and (for "now") start decoding first.
pub const ENQUEUE_SETTLE_MS: u64 = 1200;

pub struct Ctx {
    pub config: Config,
    pub player: Arc<Player>,
    pub rocksky: Rocksky,
    /// Built on first use: provisioning Subsonic credentials is a network
    /// call, and a server that cannot start without one would be useless
    /// offline for the tools that do not need it.
    subsonic: OnceCell<Arc<Subsonic>>,
    /// Analysis needs the cache database open, which is also lazy: an agent
    /// that only ever pauses the music should not create one.
    analyzer: OnceCell<Arc<Analyzer>>,
    me: OnceCell<Me>,
}

impl Ctx {
    pub fn new(config: Config, token: String) -> Ctx {
        let player = Player::connect(&config, token.clone());
        let rocksky = Rocksky::new(&config.api_url, token);
        Ctx {
            config,
            player,
            rocksky,
            subsonic: OnceCell::new(),
            analyzer: OnceCell::new(),
            me: OnceCell::new(),
        }
    }

    pub async fn subsonic(&self) -> Result<&Arc<Subsonic>> {
        self.subsonic
            .get_or_try_init(|| async {
                Subsonic::connect(
                    &self.config.api_url,
                    &self.config.navidrome_url,
                    self.rocksky.token(),
                )
                .await
                .map(Arc::new)
            })
            .await
    }

    pub async fn analyzer(&self) -> Result<&Arc<Analyzer>> {
        self.analyzer
            .get_or_try_init(|| async {
                let cache = AnalysisCache::open(&self.config.analysis_db_path()).await?;
                Ok::<_, anyhow::Error>(Arc::new(Analyzer::new(
                    cache,
                    self.config.autodj.target_lufs as f64,
                )))
            })
            .await
    }

    pub async fn me(&self) -> Result<&Me> {
        self.me
            .get_or_try_init(|| async { self.rocksky.me().await })
            .await
    }
}

/// Every tool, in the order they are advertised to the client.
pub fn definitions() -> Vec<Value> {
    let mut tools = player::definitions();
    tools.extend(library::definitions());
    tools.extend(audio::definitions());
    tools.extend(autodj::definitions());
    tools
}

/// Dispatch a `tools/call`. Errors here become `isError` tool results, not
/// protocol errors — the model should read them and adjust.
pub async fn call(ctx: &Ctx, name: &str, args: &Value) -> Result<Value> {
    let args = Args(args);
    if let Some(result) = player::call(ctx, name, &args).await? {
        return Ok(result);
    }
    if let Some(result) = library::call(ctx, name, &args).await? {
        return Ok(result);
    }
    if let Some(result) = audio::call(ctx, name, &args).await? {
        return Ok(result);
    }
    if let Some(result) = autodj::call(ctx, name, &args).await? {
        return Ok(result);
    }
    Err(anyhow!("unknown tool {name:?}"))
}

// ── Schema helpers ──────────────────────────────────────────────────────────

pub fn tool(name: &str, description: &str, properties: Value, required: &[&str]) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": required,
        },
    })
}

/// The `device` argument, shared by every tool that commands a player.
pub fn device_prop() -> Value {
    json!({
        "type": "string",
        "description": "Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass \"all\" to broadcast to every device on the account.",
    })
}

// ── Argument helpers ────────────────────────────────────────────────────────

pub struct Args<'a>(pub &'a Value);

impl Args<'_> {
    pub fn str(&self, key: &str) -> Option<&str> {
        self.0
            .get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
    }

    pub fn req_str(&self, key: &str) -> Result<&str> {
        self.str(key)
            .ok_or_else(|| anyhow!("missing required argument {key:?}"))
    }

    pub fn bool(&self, key: &str) -> Option<bool> {
        self.0.get(key).and_then(Value::as_bool)
    }

    pub fn i64(&self, key: &str) -> Option<i64> {
        self.0
            .get(key)
            .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
    }

    pub fn u32(&self, key: &str) -> Option<u32> {
        self.i64(key).map(|n| n.clamp(0, u32::MAX as i64) as u32)
    }

    pub fn req_u32(&self, key: &str) -> Result<u32> {
        self.u32(key)
            .ok_or_else(|| anyhow!("missing required argument {key:?}"))
    }

    pub fn u64(&self, key: &str) -> Option<u64> {
        self.i64(key).map(|n| n.max(0) as u64)
    }

    pub fn f32(&self, key: &str) -> Option<f32> {
        self.0.get(key).and_then(Value::as_f64).map(|f| f as f32)
    }

    pub fn array(&self, key: &str) -> Option<&Vec<Value>> {
        self.0.get(key).and_then(Value::as_array)
    }

    pub fn object(&self, key: &str) -> Option<&Value> {
        self.0.get(key).filter(|v| v.is_object())
    }

    /// A count argument with a default and a hard ceiling, so a stray `limit:
    /// 100000` cannot turn one tool call into a megabyte of JSON.
    pub fn count(&self, key: &str, default: u32, max: u32) -> u32 {
        self.u32(key).unwrap_or(default).clamp(1, max)
    }

    pub fn device(&self) -> Option<&str> {
        self.str("device")
    }
}

/// Parse a value the model supplied into a typed document, with the field path
/// in the error so a malformed section is actually fixable.
pub fn parse_json<T: serde::de::DeserializeOwned>(value: &Value, what: &str) -> Result<T> {
    serde_json::from_value(value.clone()).with_context(|| format!("invalid {what}"))
}
