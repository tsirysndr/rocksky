//! The conventions every Rocksky component shares.
//!
//! Two things have to agree across the scrobble indexer, the upload pipeline,
//! the cloud-drive scanners, the ATProto record writer and the HTTP views, and
//! neither is obvious enough to be safely reimplemented:
//!
//! - **[`identity`]** — how a track, album, artist or cover is named. These are
//!   content hashes, so they *are* the data format: changing one orphans every
//!   existing row.
//! - **[`timestamp`]** — how a timestamp goes on the wire. The TypeScript API
//!   emits JavaScript's `toISOString()`, and a client comparing strings needs
//!   the Rust side to match it to the digit.
//!
//! Nothing else belongs here. It has no database, no HTTP and no async
//! runtime, so every other crate can depend on it.

pub mod identity;
pub mod timestamp;

pub use identity::{album_hash, artist_hash, cover_id, track_hash, PLACEHOLDER_ALBUM_ART};
pub use timestamp::to_iso8601;
