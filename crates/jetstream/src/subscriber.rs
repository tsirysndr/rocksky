use std::env;

use anyhow::{Error, Context};
use futures_util::StreamExt;
use owo_colors::OwoColorize;
use sqlx::postgres::PgPoolOptions;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio::sync::mpsc;

use crate::{repo::save_scrobble, types::{Commit, Root}};

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

    pub async fn run(&self) -> Result<(), Error> {
        // Get the connection string outside of the task
        let db_url = env::var("XATA_POSTGRES_URL")
            .context("Failed to get XATA_POSTGRES_URL environment variable")?;

        let (tx, rx) = mpsc::channel::<(String, Commit)>(100);

        let tx_clone = tx.clone();

        // Start the processor task
        let processor = tokio::spawn(async move {
            let pool = PgPoolOptions::new().max_connections(5)
                .connect(&db_url).await?;

            process_scrobble_events(rx, &pool).await
        });

        let (mut ws_stream, _) = connect_async(&self.service_url).await?;
        println!("Connected to jetstream at {}", self.service_url.bright_green());

        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(msg) => {
                    if let Err(e) = self.handle_message(msg, &tx_clone).await {
                        eprintln!("Error handling message: {}", e);
                    }
                }
                Err(e) => {
                    eprintln!("WebSocket error: {}", e);
                    break;
                }
            }
        }

        drop(tx);

        // Wait for the processor task to complete
        match processor.await {
            Ok(result) => {
                if let Err(e) = result {
                    eprintln!("Processor task had an error: {}", e);
                }
            }
            Err(e) => {
                eprintln!("Processor task panicked: {}", e);
            }
        }

        Ok(())
    }

    async fn handle_message(
        &self,
        msg: Message,
        tx: &mpsc::Sender<(String, Commit)>,
    ) -> Result<(), Error> {
        if let Message::Text(text) = msg {
            let message: Root = serde_json::from_str(&text)?;
            println!("Received message: {:#?}", message);
            if let Some(commit) = message.commit {
                tx.send((message.did, commit)).await.map_err(|e| {
                    Error::msg(format!("Failed to send message to channel: {}", e))
                })?;
            }
        }

        Ok(())
    }
}

async fn process_scrobble_events(
    mut rx: mpsc::Receiver<(String, Commit)>,
    pool: &sqlx::Pool<sqlx::Postgres>,
) -> Result<(), Error> {
    while let Some((did, record)) = rx.recv().await {
        save_scrobble(pool, &did, record).await?;
    }
    Ok(())
}