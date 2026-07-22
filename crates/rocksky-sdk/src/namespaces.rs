//! Typed namespace accessors — the escape hatch for records the convenience
//! verbs on [`crate::RockskyAgent`] don't cover, mirroring `@atproto/api`'s
//! `agent.app.bsky.feed.post.create(...)`.
//!
//! **Scaffold:** the planned surface (see the generated [`crate::lexicons`]):
//!
//! ```ignore
//! let record = agent.playlist().draft().name("Hip Hop US").build();
//! let out = agent.playlist().create(record).await?;   // wraps jacquard create_record
//! agent.like_ns().delete(rkey).await?;
//! ```
//!
//! Each accessor (`song()`, `album()`, `playlist()`, …) returns a small typed
//! handle whose `create` / `put` / `delete` methods forward to jacquard's
//! `Collection`-generic record operations.
