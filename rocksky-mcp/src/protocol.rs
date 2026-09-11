//! MCP framing on top of jsonrpsee.
//!
//! MCP over stdio is newline-delimited JSON-RPC 2.0: one message per line, no
//! framing headers. `jsonrpsee`'s `RpcModule` owns the request/response
//! plumbing (method registry, id echoing, error objects); this module supplies
//! the MCP-specific pieces on top — version negotiation and the `content`
//! envelope every `tools/call` reply is wrapped in.

use jsonrpsee_types::ErrorObjectOwned;
use serde_json::{json, Value};

/// The revision advertised when a client asks for one we don't know.
pub const LATEST_VERSION: &str = "2025-06-18";

/// Revisions we speak. A client's request for any of these is echoed back
/// verbatim; anything else negotiates down to [`LATEST_VERSION`].
pub const SUPPORTED_VERSIONS: &[&str] = &["2025-06-18", "2025-03-26", "2024-11-05"];

pub const INVALID_PARAMS: i32 = -32602;
pub const INTERNAL_ERROR: i32 = -32603;

/// A protocol-level error — reserved for malformed requests. Tool failures go
/// back as [`tool_error`] results instead.
pub type RpcError = ErrorObjectOwned;

pub fn rpc_error(code: i32, message: impl Into<String>) -> RpcError {
    ErrorObjectOwned::owned(code, message.into(), None::<()>)
}

/// Wrap a tool's JSON output in the `content` envelope `tools/call` returns.
/// Both the text block and `structuredContent` carry the same document, so
/// clients that understand either one get the full result.
pub fn tool_result(value: Value) -> Value {
    let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string());
    json!({
        "content": [{ "type": "text", "text": text }],
        "structuredContent": value,
        "isError": false,
    })
}

/// A failed tool call. This is a *successful* JSON-RPC response carrying
/// `isError` — the model is meant to read the message and try something else,
/// which a protocol-level error would deny it.
pub fn tool_error(message: impl Into<String>) -> Value {
    json!({
        "content": [{ "type": "text", "text": message.into() }],
        "isError": true,
    })
}

/// Negotiate the protocol revision: honour the client's if we speak it.
pub fn negotiate(requested: Option<&str>) -> &'static str {
    requested
        .and_then(|want| SUPPORTED_VERSIONS.iter().find(|v| **v == want).copied())
        .unwrap_or(LATEST_VERSION)
}

/// Recursively drop `null` fields. Views built from lexicon structs are all
/// `Option`, and a wall of `"crossfeed": null` is noise the model pays for.
pub fn strip_nulls(value: Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .filter(|(_, v)| !v.is_null())
                .map(|(k, v)| (k, strip_nulls(v)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(strip_nulls).collect()),
        other => other,
    }
}
