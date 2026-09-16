//! Rocksky AppView — a single self-hostable binary serving the
//! `app.rocksky.*` XRPC surface over SQLite, with the web UI embedded.
//!
//! This crate is an alternative to `apps/api`, not a replacement for it: the
//! TypeScript API keeps running unchanged. The difference is the deployment
//! shape. `apps/api` expects Postgres, Redis, NATS, Typesense and a handful of
//! companion services; this binary expects nothing and creates its own SQLite
//! database on first boot, so anyone can run their own Rocksky.

pub mod actors;
pub mod atproto;
pub mod auth;
pub mod backfill;
pub mod cache;
pub mod config;
pub mod crypto;
pub mod db;
pub mod error;
pub mod ingest;
pub mod likes;
pub mod oauth;
pub mod rest;
pub mod rsql;
pub mod server;
pub mod state;
pub mod storage;
pub mod uploads;
pub mod sync;
pub mod views;
pub mod web;
pub mod xrpc;

pub use config::Config;
pub use error::{ResponseType, XrpcError, XrpcResult};
