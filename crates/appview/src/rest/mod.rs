//! The non-XRPC HTTP surface.
//!
//! These are the routes the web UI calls that are not lexicon methods — above
//! all the login handshake, without which a self-hosted instance has no way to
//! sign anyone in. The paths and payloads match `apps/api` exactly, because
//! the same `apps/web` bundle talks to both.
//!
//! The legacy REST surface is deliberately absent. `/users/{did}/albums`,
//! `/artists`, `/tracks`, `/scrobbles` and `/stats` duplicate what the
//! `app.rocksky.*` methods already answer, and `apps/web` calls the XRPC ones.
//! Porting them would mean a second implementation of the same queries.

pub mod auth;
pub mod images;
pub mod ingest;
pub mod keys;
pub mod likes;
pub mod metrics;
pub mod notifications;
pub mod nowplaying;
pub mod spotify;
pub mod storage;
pub mod uploads;

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
    spotify::configure(cfg);
    storage::configure(cfg);
    uploads::configure(cfg);
}
