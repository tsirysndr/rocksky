//! # Rocksky — async Rust SDK for the [Rocksky] XRPC API.
//!
//! [Rocksky]: https://rocksky.app
//!
//! - **Async-first** (`tokio` + `reqwest`)
//! - **Typed** — every common entity is a strongly typed `serde` struct
//! - **Idiomatic** — namespaced accessors: `client.actor()`, `client.scrobble()`, …
//! - **Escape hatch** — `client.call()` (query) / `client.procedure()` for any
//!   method not yet wrapped
//! - **Pipe-friendly** — every response type round-trips through `serde_json`,
//!   so you can stream results straight to `stdout` / shell pipelines.
//!
//! ## Quickstart
//!
//! ```no_run
//! use rocksky::Client;
//!
//! # async fn run() -> rocksky::Result<()> {
//! let client = Client::new();
//! let profile = client.actor().get_profile("alice.bsky.social").await?;
//! println!(
//!     "{} — {}",
//!     profile.display_name.as_deref().unwrap_or(""),
//!     profile.did.as_deref().unwrap_or(""),
//! );
//!
//! let did = profile.did.clone().unwrap_or_default();
//! let scrobbles = client.scrobble().list().did(did).limit(10).send().await?;
//! for s in scrobbles {
//!     println!(
//!         "  {} — {}",
//!         s.artist.as_deref().unwrap_or("?"),
//!         s.title.as_deref().unwrap_or("?"),
//!     );
//! }
//! # Ok(()) }
//! ```
//!
//! Authenticated calls take a bearer token:
//!
//! ```no_run
//! # use rocksky::Client;
//! let client = Client::builder().token("eyJhbGciOi…").build();
//! ```

#![warn(missing_debug_implementations)]
#![cfg_attr(docsrs, feature(doc_cfg))]

pub mod client;
pub mod error;
pub mod http;
pub mod models;
pub mod resources;

pub use client::{Client, ClientBuilder};
pub use error::{Error, Result};
pub use models::*;
pub use resources::graph::FollowList;
