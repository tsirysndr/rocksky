//! Durable, versioned jobs and checkpointed steps. External side effects remain
//! at-least-once: processors must use the stable job ID as their idempotency key.
#[cfg(not(any(feature = "postgres", feature = "sqlite")))]
compile_error!("enable the postgres (default) or sqlite feature");

pub mod queue;
pub mod service;
pub mod worker;

pub use queue::{Job, Queue};
