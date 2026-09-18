use std::{
    env,
    sync::{Arc, Mutex},
};

use anyhow::Error;
use async_nats::connect;
use owo_colors::OwoColorize;
use sqlx::postgres::PgPoolOptions;

use crate::{
    core::{find_spotify_users, save_playlists},
    spotify::get_user_playlists,
    subscriber::subscribe,
};

pub mod core;
pub mod crypto;
pub mod spotify;
pub mod subscriber;
pub mod types;
pub mod xata;

pub async fn start() -> Result<(), Error> {
    subscribe().await?;

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect_with(rocksky_pgurl::primary("rocksky-playlists")?)
        .await?;
    rocksky_pgurl::ensure_writable(&pool, "rocksky-playlists").await?;
    let users = find_spotify_users(&pool, 0, 100).await?;

    let addr = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let nc = connect(&addr).await?;
    let nc = Arc::new(Mutex::new(nc));
    println!("Connected to NATS server at {}", addr.bright_green());

    for user in users {
        let token = user.1.clone();
        let did = user.2.clone();
        let client_id = user.4.clone();
        let client_secret = user.5.clone();
        let playlists = get_user_playlists(token, client_id, client_secret).await?;
        save_playlists(nc.clone(), playlists, &did).await?;
    }

    println!("Done!");

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }
}
