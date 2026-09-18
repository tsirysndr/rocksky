//! Rocksky AppView — a single self-hostable binary serving the
//! `app.rocksky.*` XRPC surface over SQLite, with the web UI embedded.
//!
//! This crate is an alternative to `apps/api`, not a replacement for it: the
//! TypeScript API keeps running unchanged. The difference is the deployment
//! shape. `apps/api` expects Postgres and a long list of companion services; this
//! binary needs only NATS and Typesense — the two things it cannot fake — and
//! creates its own SQLite database on first boot, so anyone can run their own
//! Rocksky from the docker-compose file in this directory.

pub mod actors;
pub mod atproto;
pub mod auth;
pub mod backfill;
pub mod cache;
pub mod config;
pub mod crypto;
/// The data layer.
///
/// The crate `rocksky-db`, re-exported: the cloud-drive scanners and the
/// offline sweeps want the same models and the same SQL without an HTTP
/// server. Re-exported rather than imported at each call site because thirty
/// modules refer to `crate::db::…`.
pub use rocksky_db as db;
pub mod enrich;
pub mod error;
pub mod events;
pub mod generators;
pub mod ingest;
pub mod materialise;
/// Types generated from the ATProto lexicons.
///
/// The crate `rocksky-lexicon`, re-exported: it has no dependencies beyond
/// serde, so the SDK and the players can use it without pulling in a web
/// server. Regenerate with `cargo run -p rocksky-lexicon-codegen`; check for
/// drift with `--check`.
pub use rocksky_lexicon as lexicon;
pub mod likes;
pub mod oauth;
pub mod profiles;
pub mod rest;
pub use rocksky_db::rsql;
pub use rocksky_db::sea_query;
pub mod search;
pub mod server;
pub mod startup;
pub mod state;
pub mod storage;
pub mod sync;
pub mod uploads;
pub mod views;
pub mod web;
pub mod xrpc;

pub use config::Config;
pub use error::{ResponseType, XrpcError, XrpcResult};
