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

use std::{env, sync::Arc};
use actix_web::{web::Data, App, HttpServer};
use anyhow::Error;
use cache::Cache;
use dotenv::dotenv;
use owo_colors::OwoColorize;
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> Result<(), Error> {
    dotenv().ok();

    let cache = Cache::new()?;

    let pool =  PgPoolOptions::new().max_connections(5).connect(&env::var("XATA_POSTGRES_URL")?).await?;
    let conn = Arc::new(pool);

    let host = env::var("SCROBBLE_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("SCROBBLE_PORT")
        .unwrap_or_else(|_| "7882".to_string())
        .parse::<u16>()
        .unwrap_or(7882);

    println!("Starting Scrobble server @ {}", format!("{}:{}", host, port).green());

    HttpServer::new(move || {
        App::new()
            .app_data(Data::new(conn.clone()))
            .app_data(Data::new(cache.clone()))
            .service(handlers::handle_scrobble)
    })
    .bind((host, port))?
    .run()
    .await?;

    Ok(())
}
