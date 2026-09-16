//! `app.rocksky.*` methods, grouped by namespace as the lexicons are.

pub mod charts;
pub mod scrobble;
pub mod stats;

use actix_web::web::ServiceConfig;

pub fn configure(cfg: &mut ServiceConfig) {
    charts::configure(cfg);
    scrobble::configure(cfg);
    stats::configure(cfg);
}
