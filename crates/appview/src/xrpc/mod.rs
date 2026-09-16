//! The `app.rocksky.*` XRPC surface.
//!
//! One actix route per lexicon method, at `/xrpc/<nsid>`, mirroring the
//! registration table in `apps/api/src/xrpc/index.ts`. Methods are grouped by
//! namespace in submodules that match the lexicon layout, so a method is found
//! at the path its NSID implies.
//!
//! Shared conventions live here: paging defaults, the JSON reply helper, and
//! the "answer empty rather than fail" behaviour that the TypeScript handlers
//! get from their `Effect.catchAll`.

pub mod app_rocksky;

use crate::error::XrpcResult;
use actix_web::web::ServiceConfig;
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

/// Registers every method. Called once from [`crate::server::run`].
pub fn configure(cfg: &mut ServiceConfig) {
    app_rocksky::configure(cfg);
}

/// Declares the route for one lexicon method.
///
/// Spelling the NSID out as the path means the route table reads like the
/// lexicon list, and a typo cannot silently shadow another method the way a
/// derived path could.
#[macro_export]
macro_rules! xrpc_query {
    ($cfg:expr, $nsid:literal, $handler:path) => {
        $cfg.route(
            concat!("/xrpc/", $nsid),
            ::actix_web::web::get().to($handler),
        )
    };
}

#[macro_export]
macro_rules! xrpc_procedure {
    ($cfg:expr, $nsid:literal, $handler:path) => {
        $cfg.route(
            concat!("/xrpc/", $nsid),
            ::actix_web::web::post().to($handler),
        )
    };
}

/// The paging parameters almost every list method takes.
///
/// Defaults match the TypeScript handlers (`params.limit || 20`,
/// `params.offset || 0`). The cap is ours: the lexicons declare a maximum but
/// the TypeScript server does not enforce one on every method, and an
/// unbounded `limit` on a self-hosted box is a trivial way to exhaust it.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Paging {
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

pub const DEFAULT_LIMIT: i64 = 20;
pub const MAX_LIMIT: i64 = 100;

impl Default for Paging {
    fn default() -> Self {
        Self {
            limit: None,
            offset: None,
        }
    }
}

impl Paging {
    pub fn limit(&self) -> i64 {
        clamp_limit(self.limit)
    }

    pub fn offset(&self) -> i64 {
        clamp_offset(self.offset)
    }
}

/// Applies the default and the cap, and treats a nonsensical value as absent
/// rather than erroring — the TypeScript handlers do the same via `||`.
pub fn clamp_limit(limit: Option<i64>) -> i64 {
    match limit {
        Some(value) if value > 0 => value.min(MAX_LIMIT),
        _ => DEFAULT_LIMIT,
    }
}

/// Like [`clamp_limit`] but with an endpoint-specific default. The chart
/// methods default to 50 rather than 20.
pub fn clamp_limit_or(limit: Option<i64>, default: i64) -> i64 {
    match limit {
        Some(value) if value > 0 => value.min(MAX_LIMIT),
        _ => default,
    }
}

pub fn clamp_offset(offset: Option<i64>) -> i64 {
    offset.filter(|value| *value > 0).unwrap_or(0)
}

/// A successful JSON reply.
pub fn json<T: Serialize>(body: T) -> XrpcResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(body))
}

/// An empty JSON object, which is what the procedures that only have side
/// effects answer (`{ encoding: "application/json", body: {} }`).
pub fn ok_empty() -> XrpcResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({})))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paging_defaults_match_the_typescript_handlers() {
        let paging = Paging::default();
        assert_eq!(paging.limit(), 20);
        assert_eq!(paging.offset(), 0);
    }

    #[test]
    fn a_limit_is_capped() {
        assert_eq!(clamp_limit(Some(50)), 50);
        assert_eq!(clamp_limit(Some(1_000_000)), MAX_LIMIT);
    }

    #[test]
    fn nonsense_paging_falls_back_to_the_defaults() {
        // `params.limit || 20` in TypeScript treats 0 as absent too.
        assert_eq!(clamp_limit(Some(0)), DEFAULT_LIMIT);
        assert_eq!(clamp_limit(Some(-5)), DEFAULT_LIMIT);
        assert_eq!(clamp_limit(None), DEFAULT_LIMIT);
        assert_eq!(clamp_offset(Some(-5)), 0);
        assert_eq!(clamp_offset(None), 0);
    }

    #[test]
    fn paging_deserializes_from_query_strings() {
        let paging: Paging = serde_urlencoded::from_str("limit=5&offset=10").unwrap();
        assert_eq!(paging.limit(), 5);
        assert_eq!(paging.offset(), 10);

        // Both absent is the common case and must not be an error.
        let paging: Paging = serde_urlencoded::from_str("").unwrap();
        assert_eq!(paging.limit(), DEFAULT_LIMIT);
    }
}
