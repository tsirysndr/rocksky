//! `playerd mcp` — a Model Context Protocol server for Rocksky playback.
//!
//! It is a *controller*, not a player: it speaks the same remote-control
//! protocol as the web and desktop miniplayers, so it drives every device on
//! the account (playerd daemons included) rather than only the process it runs
//! in. That is what lets an agent run anywhere — a laptop, a CI box — and
//! still start music on the amp in the living room.
//!
//! Three planes, one server:
//! - [`state`] — devices, transport and queues, over the remote WebSocket;
//! - [`subsonic`] — the listener's library, for finding something to play;
//! - [`rocksky`] — history and recommendations, for deciding what that is.

mod protocol;
mod rocksky;
mod server;
mod state;
mod subsonic;
mod tools;

pub use server::run;
