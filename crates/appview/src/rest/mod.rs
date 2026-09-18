//! The non-XRPC HTTP surface.
//!
//! These are the routes the web UI calls that are not lexicon methods — above
//! all the login handshake, without which a self-hosted instance has no way to
//! sign anyone in. The paths and payloads match `apps/api` exactly, because
//! the same `apps/web` bundle talks to both.
//!
//! The legacy REST surface is deliberately absent. `apps/api` serves
//! `/users/{did}/albums`, `/artists`, `/tracks`, `/scrobbles` and `/stats`
//! from a separate analytics service, and the rest of `/users/*` duplicates
//! what the `app.rocksky.*` methods already answer from the database. Porting
//! it would mean either a second implementation of the same queries or a
//! dependency on another service to self-host, so those paths are left to the
//! XRPC surface.

pub mod auth;
pub mod images;
pub mod ingest;
pub mod keys;
pub mod likes;
pub mod notifications;
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
    notifications::configure(cfg);
    spotify::configure(cfg);
    storage::configure(cfg);
    uploads::configure(cfg);
}
