//! The stdio MCP server loop.
//!
//! One JSON message per line in, one per line out. Requests are dispatched
//! concurrently — a `search_library` waiting on the network must not hold up
//! the `pause` behind it — and every reply goes through a single writer task
//! so interleaved lines can never corrupt each other.
//!
//! Nothing but protocol frames may reach stdout; logs go to stderr (see
//! `main`), which is also where an MCP client shows them.

use std::sync::Arc;

use anyhow::Result;
use jsonrpsee_core::server::{Methods, RpcModule};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::mpsc;
use tokio::task::JoinSet;

use crate::config::Config;
use crate::protocol::{
    negotiate, rpc_error, tool_error, tool_result, RpcError, INTERNAL_ERROR, INVALID_PARAMS,
};
use crate::tools::{self, Ctx};

/// Told to the client at `initialize`, and shown to the model as the server's
/// own guidance — the one place to say how these tools fit together.
const INSTRUCTIONS: &str = "\
Rocksky: the listener's music, their players, and their scrobbling account.

Playback is real speakers, real audio, right now. `list_devices` shows every \
player online for this account (playerd daemons, the desktop app, web \
miniplayers); every command tool takes an optional `device` (name or id) and \
picks the obvious one when there is only one.

To play something: find it with `search_library` (or `browse_songs`, \
`get_album`, `get_playlist`) and pass the ids to `enqueue`. `enqueue` also \
accepts plain {title, artist} pairs and matches them against the library \
itself, so recommendations and history — which come back as names — can be \
queued directly.

To DJ well: read `get_listening_history` and `get_recommendations` first, build \
a set with a shape (an opener that fits what is already playing, a middle, an \
ending), queue it with `enqueue` mode \"now\" to take over or \"last\" to \
extend what is already going, and check `get_player_state` afterwards. Prefer \
adding to the queue over replacing it while something is playing.

The account tools answer questions instead of changing anything: `whoami`, \
`get_profile`, `get_stats`, `get_scrobbles` and `get_now_playing` work for any \
Rocksky user (pass `actor`, a handle or DID; omit it for the logged-in one), \
`search` looks across everything Rocksky has indexed rather than only this \
listener's library, and `get_charts` is what the whole platform is playing.";

pub async fn run(config: Config, token: String) -> Result<()> {
    let ctx = Arc::new(Ctx::new(config, token));
    let methods: Methods = build_module(ctx)?.into();

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let writer = tokio::spawn(async move {
        let mut stdout = tokio::io::stdout();
        while let Some(line) = rx.recv().await {
            if stdout.write_all(line.as_bytes()).await.is_err()
                || stdout.write_all(b"\n").await.is_err()
                || stdout.flush().await.is_err()
            {
                break;
            }
        }
    });

    // In-flight requests, so a client that closes stdin right after writing
    // still gets its answers instead of losing them to process exit.
    let mut inflight = JoinSet::new();

    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    while let Some(line) = lines.next_line().await? {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }
        let parsed: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(e) => {
                let _ = tx.send(parse_error(&format!("invalid JSON: {e}")));
                continue;
            }
        };
        // A notification (no `id`) wants no reply — `notifications/initialized`
        // and friends end here.
        if parsed.get("id").is_none() {
            let method = parsed
                .get("method")
                .and_then(|m| m.as_str())
                .unwrap_or("")
                .to_string();
            tracing::debug!(method, "notification");
            continue;
        }
        if parsed.is_array() {
            let _ = tx.send(parse_error("batched requests are not supported"));
            continue;
        }

        let methods = methods.clone();
        let tx = tx.clone();
        inflight.spawn(async move {
            match methods.raw_json_request(&line, 1).await {
                Ok((response, _)) => {
                    let _ = tx.send(response.get().to_string());
                }
                Err(e) => {
                    let _ = tx.send(parse_error(&format!("malformed request: {e}")));
                }
            }
        });
    }

    tracing::info!("stdin closed, draining {} request(s)", inflight.len());
    while inflight.join_next().await.is_some() {}
    // Dropping the last sender ends the writer, which flushes what is queued.
    drop(tx);
    let _ = writer.await;
    Ok(())
}

fn build_module(ctx: Arc<Ctx>) -> Result<RpcModule<Ctx>> {
    let mut module = RpcModule::from_arc(ctx);

    module.register_async_method("initialize", |params, _ctx, _| async move {
        let params: Value = params.parse().unwrap_or(Value::Null);
        let version = negotiate(params.get("protocolVersion").and_then(Value::as_str));
        Ok::<_, RpcError>(json!({
            "protocolVersion": version,
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": {
                "name": "rocksky-mcp",
                "title": "Rocksky",
                "version": env!("CARGO_PKG_VERSION"),
            },
            "instructions": INSTRUCTIONS,
        }))
    })?;

    module.register_async_method(
        "ping",
        |_, _, _| async move { Ok::<_, RpcError>(json!({})) },
    )?;

    module.register_async_method("tools/list", |_, _, _| async move {
        Ok::<_, RpcError>(json!({ "tools": tools::definitions() }))
    })?;

    module.register_async_method("tools/call", |params, ctx, _| async move {
        let params: Value = params
            .parse()
            .map_err(|e| rpc_error(INVALID_PARAMS, format!("invalid params: {e}")))?;
        let name = params
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| rpc_error(INVALID_PARAMS, "missing tool name"))?
            .to_string();
        let arguments = params
            .get("arguments")
            .cloned()
            .unwrap_or_else(|| json!({}));

        match tools::call(&ctx, &name, &arguments).await {
            Ok(value) => Ok(tool_result(value)),
            // Tool failures come back as results, not protocol errors: the
            // model is meant to read the message and adjust.
            Err(e) => {
                tracing::warn!(tool = %name, "tool failed: {e:#}");
                Ok::<_, RpcError>(tool_error(format!("{e:#}")))
            }
        }
    })?;

    // Advertised nowhere, but clients probe for them anyway; an empty list is
    // friendlier than a method-not-found they have to special-case.
    module.register_async_method("prompts/list", |_, _, _| async move {
        Ok::<_, RpcError>(json!({ "prompts": [] }))
    })?;
    module.register_async_method("resources/list", |_, _, _| async move {
        Ok::<_, RpcError>(json!({ "resources": [] }))
    })?;
    module.register_async_method("resources/templates/list", |_, _, _| async move {
        Ok::<_, RpcError>(json!({ "resourceTemplates": [] }))
    })?;

    Ok(module)
}

fn parse_error(message: &str) -> String {
    json!({
        "jsonrpc": "2.0",
        "id": Value::Null,
        "error": { "code": INTERNAL_ERROR, "message": message },
    })
    .to_string()
}
