//! ATProto, as this instance uses it.
//!
//! The protocol itself — CAR parsing, MST walking, record writing, DID
//! resolution — lives in `rocksky-atproto`, which has no database and no HTTP
//! server and so can be used by the SDK and the players too. What stays here
//! is [`session`]: where an instance keeps its PDS sessions is its own
//! business, and this one keeps them in the same SQLite file `apps/api` wrote.
//!
//! The protocol crate is re-exported rather than imported at each call site,
//! because every caller already refers to `crate::atproto::{car, mst, records}`
//! and the paths are worth keeping stable.

pub mod session;
pub mod writer;

pub use rocksky_atproto::{car, mst, records};
pub use rocksky_atproto::{
    fetch_repo, records_from_car, resolve, resolve_pds, Identity, ResolveError,
};
