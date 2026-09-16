//! `app.rocksky.*` methods, grouped by namespace as the lexicons are.

pub mod actor;
pub mod album;
pub mod apikey;
pub mod artist;
pub mod charts;
pub mod feed;
pub mod graph;
pub mod library;
pub mod like;
pub mod mirror;
pub mod notification;
pub mod playlist;
pub mod ranking;
pub mod scrobble;
pub mod scrobble_write;
pub mod settings;
pub mod shout;
pub mod song;
pub mod stats;
pub mod taste;

use actix_web::web::ServiceConfig;

pub fn configure(cfg: &mut ServiceConfig) {
    actor::configure(cfg);
    album::configure(cfg);
    apikey::configure(cfg);
    artist::configure(cfg);
    charts::configure(cfg);
    feed::configure(cfg);
    graph::configure(cfg);
    library::configure(cfg);
    like::configure(cfg);
    mirror::configure(cfg);
    notification::configure(cfg);
    playlist::configure(cfg);
    settings::configure(cfg);
    shout::configure(cfg);
    song::configure(cfg);
    scrobble::configure(cfg);
    scrobble_write::configure(cfg);
    stats::configure(cfg);
    taste::configure(cfg);
}
