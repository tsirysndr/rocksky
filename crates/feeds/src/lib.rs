//! The Rocksky feed generator.
//!
//! A port of `apps/feeds` (Deno + Hono) to Rust. It serves genre feeds over
//! the scrobble history: `app.rocksky.feed.describeFeedGenerator` advertises
//! the feeds, `app.rocksky.feed.getFeedSkeleton` serves one, and
//! `/.well-known/did.json` is the `did:web` document that makes this instance
//! resolvable as an ATProto service.
//!
//! # A library and a binary
//!
//! Deployed today as its own service, which `main.rs` still does. But it is a
//! library first, so a single self-hosted binary can mount
//! [`configure`] alongside the appview's own routes and serve the feeds from
//! the same process and the same database — which is the point of the
//! self-hosting work, and impossible while this was a separate Deno app.
//!
//! # It only reads
//!
//! Every query here is a `SELECT`. A feed generator is eventually consistent
//! by design — nobody minds a scrobble appearing a second late — which is why
//! `apps/feeds` prefers a read replica when one exists, and why this does too
//! via [`rocksky_db::Backend::reads_may_lag`].
//!
//! # Where it diverges from `apps/feeds`, deliberately
//!
//! | difference                          | why                                                      |
//! |-------------------------------------|----------------------------------------------------------|
//! | returns the lexicon's response shape | upstream answers `{feed:[{scrobble:uri}]}` where the lexicon declares `{scrobbles:[scrobbleViewBasic],cursor}` — see [`xrpc`] |
//! | `limit` is capped at 100             | upstream has no cap, so `?limit=100000` serializes the history |
//! | 52 algorithms are one table          | they were fifty-two copies of one query — see [`feeds`] |
//! | the publisher DID is configurable    | it was hard-coded to the rocksky.app account, which is wrong for anyone self-hosting |

pub mod config;
pub mod feeds;
pub mod identity;
pub mod xrpc;

pub use config::Config;

use actix_web::web::ServiceConfig;

/// Registers every route this generator serves.
///
/// Split from the binary so the appview can mount it.
pub fn configure(cfg: &mut ServiceConfig) {
    xrpc::configure(cfg);
    identity::configure(cfg);
}

/// What a handler needs: the database and the service identity.
#[derive(Clone)]
pub struct FeedsState(std::sync::Arc<Inner>);

pub struct Inner {
    pub db: rocksky_db::Backend,
    pub config: Config,
}

impl FeedsState {
    pub fn new(db: rocksky_db::Backend, config: Config) -> Self {
        Self(std::sync::Arc::new(Inner { db, config }))
    }

    /// The replica when one is configured, since a feed tolerates lag.
    pub fn db(&self) -> rocksky_db::Backend {
        self.0.db.reads_may_lag()
    }

    pub fn config(&self) -> &Config {
        &self.0.config
    }
}
