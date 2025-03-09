use core::{create_tables, find_spotify_users, load_users, save_playlists};
use std::{env, sync::{Arc, Mutex}};

use anyhow::Error;
use async_nats::connect;
use dotenv::dotenv;
use duckdb::Connection;
use owo_colors::OwoColorize;
use playlists::subscriber::subscribe;
use spotify::get_user_playlists;
use sqlx::postgres::PgPoolOptions;

pub mod types;
pub mod crypto;
pub mod xata;
pub mod core;
pub mod spotify;

#[tokio::main]
async fn main() -> Result<(), Error> {
    dotenv().ok();

    let conn = Connection::open("./rocksky-playlists.ddb")?;
    let conn = Arc::new(Mutex::new(conn));
    create_tables(conn.clone())?;

    subscribe(
      conn.clone()
    ).await?;

    let pool = PgPoolOptions::new().max_connections(5).connect(&env::var("XATA_POSTGRES_URL")?).await?;
    let users = find_spotify_users(&pool, 0, 100).await?;

    load_users(conn.clone(), &pool).await?;

    sqlx::query(r#"
      CREATE UNIQUE INDEX IF NOT EXISTS user_playlists_unique_index ON user_playlists (user_id, playlist_id)
    "#)
      .execute(&pool)
      .await?;
    let conn = conn.clone();

    let addr = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let nc = connect(&addr).await?;
    let nc = Arc::new(Mutex::new(nc));
    println!("Connected to NATS server at {}", addr.bright_green());

    for user in users {
      let token = user.1.clone();
      let did = user.2.clone();
      let user_id = user.3.clone();
      let playlists = get_user_playlists(token).await?;
      save_playlists(&pool, conn.clone(), nc.clone(),playlists, &user_id, &did).await?;
    }

    println!("Done!");

    loop {
      tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }
}

