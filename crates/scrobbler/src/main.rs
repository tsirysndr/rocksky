pub mod handlers;
pub mod models;
pub mod signature;

use std::env;

use actix_web::{App, HttpServer};
use owo_colors::OwoColorize;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let host = env::var("SCROBBLE_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("SCROBBLE_PORT")
        .unwrap_or_else(|_| "7882".to_string())
        .parse::<u16>()
        .unwrap_or(7882);

    println!("Starting Scrobble server @ {}", format!("{}:{}", host, port).green());

    HttpServer::new(|| {
        App::new()
            .service(handlers::scrobble)
    })
    .bind((host, port))?
    .run()
    .await
}