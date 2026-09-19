//! The non-XRPC HTTP surface.
//!
//! These are the routes the web UI calls that are not lexicon methods — above
//! all the login handshake, without which a self-hosted instance has no way to
//! sign anyone in. The paths and payloads match `apps/api` exactly, because
//! the same `apps/web` bundle talks to both.
//!
//! Most of the legacy `/users/*` surface is deliberately absent —
//! `/users/{did}/albums`, `/artists`, `/tracks`, `/scrobbles` and `/stats`
//! duplicate what the `app.rocksky.*` methods answer, and `apps/web` calls
//! the XRPC ones. The exceptions live in [`users`]: playlists, the shout
//! threads and like-by-row-id, which the UI still reaches at their old
//! paths.

pub mod auth;
pub mod images;
pub mod ingest;
pub mod keys;
pub mod likes;
pub mod metrics;
pub mod notifications;
pub mod nowplaying;
pub mod remote;
pub mod spotify;
pub mod storage;
pub mod uploads;
pub mod users;

use actix_web::web::ServiceConfig;

pub fn configure(cfg: &mut ServiceConfig) {
    auth::configure(cfg);
    images::configure(cfg);
    ingest::configure(cfg);
    keys::configure(cfg);
    likes::configure(cfg);
    metrics::configure(cfg);
    notifications::configure(cfg);
    nowplaying::configure(cfg);
    remote::configure(cfg);
    spotify::configure(cfg);
    storage::configure(cfg);
    uploads::configure(cfg);
    users::configure(cfg);
}
