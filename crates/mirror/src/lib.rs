//! `rocksky-mirror` ingests plays from external scrobbling services
//! (Last.fm, ListenBrainz, Teal.fm) and re-publishes them into Rocksky via
//! xrpc `app.rocksky.scrobble.createScrobble`.
//!
//! Exposed as a rockskyd subcommand (`rockskyd mirror`); there is no
//! standalone binary.
//!
//! Shared plumbing:
//!   * [`dedup`] — ±120s window check against the `scrobbles` table to avoid
//!     mirroring a play the user already has from another source.
//!   * [`rocksky`] — wraps the xrpc call.
//!   * [`crypto`] — libsodium secretbox decrypt for the API keys persisted by
//!     the API layer (`apps/api/src/lib/storage-crypto.ts`).

pub mod creds;
pub mod crypto;
pub mod db;
pub mod dedup;
pub mod enrich;
pub mod lastfm;
pub mod listenbrainz;
pub mod rocksky;
pub mod supervisor;
pub mod tealfm;
pub mod token;
pub mod track;

pub const MIRROR_NATS_TOPIC: &str = "rocksky.mirror.user";
pub const TEALFM_PLAY_NSID: &str = "fm.teal.alpha.feed.play";

/// Providers we mirror from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Provider {
    Lastfm,
    Listenbrainz,
    Tealfm,
}

impl Provider {
    pub fn as_str(self) -> &'static str {
        match self {
            Provider::Lastfm => "lastfm",
            Provider::Listenbrainz => "listenbrainz",
            Provider::Tealfm => "tealfm",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "lastfm" => Some(Provider::Lastfm),
            "listenbrainz" => Some(Provider::Listenbrainz),
            "tealfm" => Some(Provider::Tealfm),
            _ => None,
        }
    }
}

/// Entrypoint used by `rockskyd mirror`.
pub async fn run() -> anyhow::Result<()> {
    supervisor::run().await
}
