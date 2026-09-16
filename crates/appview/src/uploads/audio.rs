//! The audio pipeline, re-exported.
//!
//! Moved to `rocksky-audio`: decoding, loudness measurement and key detection
//! pull in `symphonia`, `ebur128`, `lofty` and `rocksky-analysis`, none of
//! which an HTTP server needs in its dependency graph, and all of which the
//! cloud-drive scanners want too.
//!
//! Re-exported here because the upload route refers to `audio::read_tags`,
//! `audio::validate` and the rest throughout.
pub use rocksky_audio::*;
