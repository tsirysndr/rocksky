use std::{
    collections::HashMap,
    env,
    sync::{Arc, Mutex, atomic::AtomicBool},
    thread,
};

use anyhow::Error;
use async_nats::connect;
use dotenv::dotenv;
use owo_colors::OwoColorize;
use rocksky_spotify::cache::Cache;
use rocksky_spotify::{find_spotify_user, find_spotify_users, watch_currently_playing};
use sqlx::postgres::PgPoolOptions;
use tokio_stream::StreamExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    let cache = Cache::new()?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let addr = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let nc = connect(&addr).await?;
    println!("Connected to NATS server at {}", addr.bright_green());

    let mut sub = nc.subscribe("rocksky.spotify.user".to_string()).await?;
    println!("Subscribed to {}", "rocksky.spotify.user".bright_green());

    let users = find_spotify_users(&pool, 0, 100).await?;
    println!("Found {} users", users.len().bright_green());

    // Shared HashMap to manage threads and their stop flags
    let thread_map: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>> =
        Arc::new(Mutex::new(HashMap::new()));

    // Start threads for all users
    for user in users {
        let email = user.0.clone();
        let token = user.1.clone();
        let did = user.2.clone();
        let stop_flag = Arc::new(AtomicBool::new(false));
        let cache = cache.clone();
        let nc = nc.clone();
        let thread_map = Arc::clone(&thread_map);

        thread_map
            .lock()
            .unwrap()
            .insert(email.clone(), Arc::clone(&stop_flag));

        thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            match rt.block_on(async {
                watch_currently_playing(email.clone(), token, did, stop_flag, cache.clone())
                    .await?;
                Ok::<(), Error>(())
            }) {
                Ok(_) => {}
                Err(e) => {
                    println!(
                        "{} Error starting thread for user: {} - {}",
                        format!("[{}]", email).bright_green(),
                        email.bright_green(),
                        e.to_string().bright_red()
                    );

                    // If there's an error, publish a message to restart the thread
                    match rt.block_on(nc.publish("rocksky.spotify.user", email.clone().into())) {
                        Ok(_) => {
                            println!(
                                "{} Published message to restart thread for user: {}",
                                format!("[{}]", email).bright_green(),
                                email.bright_green()
                            );
                        }
                        Err(e) => {
                            println!(
                                "{} Error publishing message to restart thread: {}",
                                format!("[{}]", email).bright_green(),
                                e.to_string().bright_red()
                            );
                        }
                    }
                }
            }
        });
    }

    // Handle subscription messages
    while let Some(message) = sub.next().await {
        let user_id = String::from_utf8(message.payload.to_vec()).unwrap();
        println!(
            "Received message to restart thread for user: {}",
            user_id.bright_green()
        );

        let mut thread_map = thread_map.lock().unwrap();

        // Check if the user exists in the thread map
        if let Some(stop_flag) = thread_map.get(&user_id) {
            // Stop the existing thread
            stop_flag.store(true, std::sync::atomic::Ordering::Relaxed);

            // Create a new stop flag and restart the thread
            let new_stop_flag = Arc::new(AtomicBool::new(false));
            thread_map.insert(user_id.clone(), Arc::clone(&new_stop_flag));

            let user = find_spotify_user(&pool, &user_id).await?;

            if user.is_none() {
                println!(
                    "Spotify user not found: {}, skipping",
                    user_id.bright_green()
                );
                continue;
            }

            let user = user.unwrap();

            let email = user.0.clone();
            let token = user.1.clone();
            let did = user.2.clone();
            let cache = cache.clone();

            thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                match rt.block_on(async {
                    watch_currently_playing(
                        email.clone(),
                        token,
                        did,
                        new_stop_flag,
                        cache.clone(),
                    )
                    .await?;
                    Ok::<(), Error>(())
                }) {
                    Ok(_) => {}
                    Err(e) => {
                        println!(
                            "{} Error restarting thread for user: {} - {}",
                            format!("[{}]", email).bright_green(),
                            email.bright_green(),
                            e.to_string().bright_red()
                        );
                    }
                }
            });

            println!("Restarted thread for user: {}", user_id.bright_green());
        } else {
            println!(
                "No thread found for user: {}, starting new thread",
                user_id.bright_green()
            );
            let user = find_spotify_user(&pool, &user_id).await?;
            if let Some(user) = user {
                let email = user.0.clone();
                let token = user.1.clone();
                let did = user.2.clone();
                let stop_flag = Arc::new(AtomicBool::new(false));
                let cache = cache.clone();
                let nc = nc.clone();

                thread_map.insert(email.clone(), Arc::clone(&stop_flag));

                thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    match rt.block_on(async {
                        watch_currently_playing(
                            email.clone(),
                            token,
                            did,
                            stop_flag,
                            cache.clone(),
                        )
                        .await?;
                        Ok::<(), Error>(())
                    }) {
                        Ok(_) => {}
                        Err(e) => {
                            println!(
                                "{} Error starting thread for user: {} - {}",
                                format!("[{}]", email).bright_green(),
                                email.bright_green(),
                                e.to_string().bright_red()
                            );
                            match rt
                                .block_on(nc.publish("rocksky.spotify.user", email.clone().into()))
                            {
                                Ok(_) => {}
                                Err(e) => {
                                    println!(
                                        "{} Error publishing message to restart thread: {}",
                                        format!("[{}]", email).bright_green(),
                                        e.to_string().bright_red()
                                    );
                                }
                            }
                        }
                    }
                });
            }
        }
    }

    Ok(())
}
