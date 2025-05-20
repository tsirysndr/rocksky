use std::{env, sync::Arc};

use actix_web::{web::Data, App, HttpServer};
use anyhow::Error;
use cache::Cache;
use dotenv::dotenv;
use owo_colors::OwoColorize;
use sqlx::postgres::PgPoolOptions;

pub mod rocksky;
pub mod cache;
pub mod handlers;
pub mod xata;
pub mod types;
pub mod repo;
pub mod auth;
pub mod spotify;
pub mod musicbrainz;
pub mod scrobbler;
pub mod crypto;

pub const BANNER: &str = r#"
  _       __     __   _____                 __    __    __
 | |     / /__  / /_ / ___/______________  / /_  / /_  / /__  _____
 | | /| / / _ \/ __ \\__ \/ ___/ ___/ __ \/ __ \/ __ \/ / _ \/ ___/
 | |/ |/ /  __/ /_/ /__/ / /__/ /  / /_/ / /_/ / /_/ / /  __/ /
 |__/|__/\___/_.___/____/\___/_/   \____/_.___/_.___/_/\___/_/


    This is the Rocksky WebScrobbler Webhook API compatible with webscrobbler extension.
"#;

#[tokio::main]
async fn main() -> Result<(), Error> {
    dotenv().ok();

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

    HttpServer::new(move || {
        App::new()
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
