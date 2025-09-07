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

use crate::{cache::Cache, consts::BANNER};

pub mod auth;
pub mod cache;
pub mod consts;
pub mod crypto;
pub mod handlers;
pub mod musicbrainz;
pub mod repo;
pub mod rocksky;
pub mod scrobbler;
pub mod spotify;
pub mod types;
pub mod xata;

pub async fn start_server() -> Result<(), Error> {
    println!("{}", BANNER.magenta());

    let cache = Cache::new()?;

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let conn = Arc::new(pool);

    let host = env::var("WEBSCROBBLER_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("WEBSCROBBLER_PORT")
        .unwrap_or_else(|_| "7883".to_string())
        .parse::<u16>()
        .unwrap_or(7883);

    println!(
        "Starting WebScrobbler Webhook @ {}",
        format!("{}:{}", host, port).green()
    );

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

    HttpServer::new(move || {
        App::new()
            .wrap(RateLimiter::default())
            .app_data(limiter.clone())
            .app_data(Data::new(conn.clone()))
            .app_data(Data::new(cache.clone()))
            .service(handlers::index)
            .service(handlers::handle_scrobble)
    })
    .bind((host, port))?
    .run()
    .await?;
    Ok(())
}
