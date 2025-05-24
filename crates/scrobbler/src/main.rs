pub mod handlers;
pub mod signature;
pub mod musicbrainz;
pub mod spotify;
pub mod xata;
pub mod cache;
pub mod auth;
pub mod params;
pub mod scrobbler;
pub mod response;
pub mod crypto;
pub mod rocksky;
pub mod repo;
pub mod types;
pub mod listenbrainz;

use actix_session::SessionExt as _;
use std::{env, sync::Arc, time::Duration};
use actix_limitation::{Limiter, RateLimiter};
use actix_web::{dev::ServiceRequest, web::{self, Data}, App, HttpServer};
use anyhow::Error;
use cache::Cache;
use dotenv::dotenv;
use owo_colors::OwoColorize;
use sqlx::postgres::PgPoolOptions;


pub const BANNER: &str = r#"
    ___             ___          _____                 __    __    __
   /   | __  ______/ (_)___     / ___/______________  / /_  / /_  / /__  _____
  / /| |/ / / / __  / / __ \    \__ \/ ___/ ___/ __ \/ __ \/ __ \/ / _ \/ ___/
 / ___ / /_/ / /_/ / / /_/ /   ___/ / /__/ /  / /_/ / /_/ / /_/ / /  __/ /
/_/  |_\__,_/\__,_/_/\____/   /____/\___/_/   \____/_.___/_.___/_/\___/_/

 This is the Rocksky Scrobbler API compatible with Last.fm AudioScrobbler API
"#;

#[tokio::main]
async fn main() -> Result<(), Error> {
    dotenv().ok();

    println!("{}", BANNER.magenta());

    let cache = Cache::new()?;

    let pool =  PgPoolOptions::new().max_connections(5).connect(&env::var("XATA_POSTGRES_URL")?).await?;
    let conn = Arc::new(pool);

    let host = env::var("SCROBBLE_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("SCROBBLE_PORT")
        .unwrap_or_else(|_| "7882".to_string())
        .parse::<u16>()
        .unwrap_or(7882);

    println!("Starting Scrobble server @ {}", format!("{}:{}", host, port).green());

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
            .service(handlers::handle_methods)
            .service(handlers::handle_nowplaying)
            .service(handlers::handle_submission)
            .service(handlers::handle_submit_listens)
            .service(handlers::handle_validate_token)
            .service(handlers::index)
            .service(handlers::handle_get)
    })
    .bind((host, port))?
    .run()
    .await?;

    Ok(())
}
