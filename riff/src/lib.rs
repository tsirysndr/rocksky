//! riff — a read-only Spotify Web API served straight from Parquet.
//!
//! Rocksky keeps a full Spotify catalog dump as Parquet files. riff puts DuckDB
//! in front of them and answers on Spotify's own paths, with Spotify's own
//! object shapes, so moving a client over is a base-URL change and nothing else:
//!
//! ```text
//! SPOTIFY_API_URL=http://localhost:8092/v1
//! ```
//!
//! Catalog data only — nothing user-scoped (`/me`, player, playlists) exists in
//! the dump, so none of it is served here.

pub mod catalog;
pub mod db;
pub mod error;
pub mod fixtures;
pub mod mb;
pub mod models;
pub mod ratelimit;
pub mod routes;
pub mod search;

use std::sync::OnceLock;

pub const DEFAULT_PORT: u16 = 8092;

/// The bound port, so `GET /` can print the base URL a client should actually
/// use instead of a hardcoded default.
static LISTEN_PORT: OnceLock<u16> = OnceLock::new();

pub fn set_listen_port(port: u16) {
    let _ = LISTEN_PORT.set(port);
}

pub fn listen_port() -> u16 {
    LISTEN_PORT.get().copied().unwrap_or(DEFAULT_PORT)
}
