//! JavaScript-compatible timestamp formatting.
//!
//! Moved to `rocksky-core` so the ATProto record writer and the cloud-drive
//! scanners can format timestamps the same way without depending on the whole
//! appview. Re-exported here because every view already refers to
//! `crate::views::timestamp::{required, optional}` in its `serde(with = ...)`
//! attributes, and those are the paths the parity tests pin.
pub use rocksky_core::timestamp::{optional, required, to_iso8601};
