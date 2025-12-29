pub mod auth;
pub mod cache;
pub mod crypto;
pub mod handlers;
pub mod listenbrainz;
pub mod musicbrainz;
pub mod params;
pub mod repo;
pub mod response;
pub mod rocksky;
pub mod scrobbler;
pub mod signature;
pub mod spotify;
pub mod types;
pub mod xata;

use std::{env, sync::Arc, time::Duration};

use actix_limitation::{Limiter, RateLimiter};
use actix_session::SessionExt;
use actix_web::{
    dev::ServiceRequest,
    web::{self, Data},
    App, HttpServer,
};
use anyhow::Error;
use owo_colors::OwoColorize;
use sqlx::postgres::PgPoolOptions;

use crate::{cache::Cache, musicbrainz::client::MusicbrainzClient};

pub const BANNER: &str = r#"
    ___             ___          _____                 __    __    __
   /   | __  ______/ (_)___     / ___/______________  / /_  / /_  / /__  _____
  / /| |/ / / / __  / / __ \    \__ \/ ___/ ___/ __ \/ __ \/ __ \/ / _ \/ ___/
 / ___ / /_/ / /_/ / / /_/ /   ___/ / /__/ /  / /_/ / /_/ / /_/ / /  __/ /
/_/  |_\__,_/\__,_/_/\____/   /____/\___/_/   \____/_.___/_.___/_/\___/_/

 This is the Rocksky Scrobbler API compatible with Last.fm AudioScrobbler API
"#;

pub async fn run() -> Result<(), Error> {
    println!("{}", BANNER.magenta());

    let cache = Cache::new()?;

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .min_connections(5)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_secs(300))
        .max_lifetime(Duration::from_secs(1800))
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;
    let conn = Arc::new(pool);

    let host = env::var("SCROBBLE_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("SCROBBLE_PORT")
        .unwrap_or_else(|_| "7882".to_string())
        .parse::<u16>()
        .unwrap_or(7882);

    tracing::info!(url = %format!("http://{}:{}", host, port).bright_green(), "Starting Scrobble server @");

    let limiter = web::Data::new(
        Limiter::builder("redis://127.0.0.1")
            .key_by(|req: &ServiceRequest| {
                req.get_session()
                    .get(&"session-id")
                    .unwrap_or_else(|_| req.cookie(&"rate-api-id").map(|c| c.to_string()))
            })
            .limit(100)
            .period(Duration::from_secs(60)) // 60 minutes
            .build()
            .unwrap(),
    );

    let mb_client = MusicbrainzClient::new().await?;
    let mb_client = Arc::new(mb_client);

    HttpServer::new(move || {
        App::new()
            .wrap(RateLimiter::default())
            .app_data(limiter.clone())
            .app_data(Data::new(conn.clone()))
            .app_data(Data::new(cache.clone()))
            .app_data(Data::new(mb_client.clone()))
            .service(handlers::handle_methods)
            .service(handlers::handle_nowplaying)
            .service(handlers::handle_submission)
            .service(listenbrainz::handlers::handle_submit_listens)
            .service(listenbrainz::handlers::handle_validate_token)
            .service(listenbrainz::handlers::handle_search_users)
            .service(listenbrainz::handlers::handle_get_playing_now)
            .service(listenbrainz::handlers::handle_get_listens)
            .service(listenbrainz::handlers::handle_get_listen_count)
            .service(listenbrainz::handlers::handle_get_artists)
            .service(listenbrainz::handlers::handle_get_recordings)
            .service(listenbrainz::handlers::handle_get_release_groups)
            .service(handlers::index)
            .service(handlers::handle_get)
    })
    .bind((host, port))?
    .run()
    .await?;

    Ok(())
}
