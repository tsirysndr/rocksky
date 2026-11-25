//! Embedded audio pipeline from https://github.com/tsirysndr/hlsd (MIT).
//! The host supplies a PCM reader and owns the HTTP server and lifecycle.
pub mod boxes;
pub mod codec;
pub mod config;
pub mod mux;
pub mod playlist;
pub mod segmenter;
