use std::{env, sync::Arc};

use anyhow::{Context, Error};
use futures_util::StreamExt;
use owo_colors::OwoColorize;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::{repo::save_scrobble, types::Root, webhook_worker::AppState};

pub const SCROBBLE_NSID: &str = "app.rocksky.scrobble";
pub const ARTIST_NSID: &str = "app.rocksky.artist";
pub const ALBUM_NSID: &str = "app.rocksky.album";
pub const SONG_NSID: &str = "app.rocksky.song";
pub const PLAYLIST_NSID: &str = "app.rocksky.playlist";
pub const LIKE_NSID: &str = "app.rocksky.like";
pub const SHOUT_NSID: &str = "app.rocksky.shout";

pub struct ScrobbleSubscriber {
    pub service_url: String,
}

impl ScrobbleSubscriber {
    pub fn new(service: &str) -> Self {
        Self {
            service_url: service.to_string(),
        }
    }

    pub async fn run(&self, state: Arc<Mutex<AppState>>) -> Result<(), Error> {
        // Get the connection string outside of the task
        let db_url = env::var("XATA_POSTGRES_URL")
            .context("Failed to get XATA_POSTGRES_URL environment variable")?;

        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await?;
        let pool = Arc::new(Mutex::new(pool));

        let (mut ws_stream, _) = connect_async(&self.service_url).await?;
        println!(
            "Connected to jetstream at {}",
            self.service_url.bright_green()
        );

        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(msg) => {
                    if let Err(e) = handle_message(state.clone(), pool.clone(), msg).await {
                        eprintln!("Error handling message: {}", e);
                    }
                }
                Err(e) => {
                    eprintln!("WebSocket error: {}", e);
                    break;
                }
            }
        }

        Ok(())
    }
}

async fn handle_message(
    state: Arc<Mutex<AppState>>,
    pool: Arc<Mutex<sqlx::PgPool>>,
    msg: Message,
) -> Result<(), Error> {
    tokio::spawn(async move {
        if let Message::Text(text) = msg {
            let message: Root = serde_json::from_str(&text)?;

            if message.kind != "commit" {
                return Ok::<(), Error>(());
            }

            println!("Received message: {:#?}", message);
            if let Some(commit) = message.commit {
                match save_scrobble(state, pool, &message.did, commit).await {
                    Ok(_) => {
                        println!("Scrobble saved successfully");
                    }
                    Err(e) => {
                        eprintln!("Error saving scrobble: {}", e);
                    }
                }
            }
        }
        Ok(())
    });

    Ok(())
}
