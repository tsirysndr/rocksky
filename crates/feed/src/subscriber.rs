use anyhow::Error;
use owo_colors::OwoColorize;
use tokio_stream::StreamExt;
use tokio_tungstenite::connect_async;
use tungstenite::Message;

use crate::{
    repo::{Repo, RepoImpl},
    types::{AlbumRecord, ArtistRecord, Commit, Root, ScrobbleRecord, SongRecord},
    ALBUM_NSID, ARTIST_NSID, SCROBBLE_NSID, SONG_NSID,
};

pub struct ScrobbleSubscriber {
    pub service_url: String,
}

impl ScrobbleSubscriber {
    pub fn new(service: &str) -> Self {
        Self {
            service_url: service.to_string(),
        }
    }

    pub async fn run(&self, repo: RepoImpl) -> Result<(), Error> {
        let (mut ws_stream, _) = connect_async(&self.service_url).await?;
        tracing::info!(url = %self.service_url.bright_green(), "Connected to jetstream at");

        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(msg) => {
                    if let Err(e) = handle_message(&repo, msg) {
                        tracing::error!(error = %e, "Error handling message");
                    }
                }
                Err(e) => {
                    tracing::error!(error = %e, "WebSocket error");
                    break;
                }
            }
        }

        Ok(())
    }
}

fn handle_message(repo: &RepoImpl, msg: Message) -> Result<(), Error> {
    let repo = repo.clone();
    tokio::spawn(async move {
        if let Message::Text(text) = msg {
            let message: Root = serde_json::from_str(&text)?;

            if message.kind != "commit" {
                return Ok::<(), Error>(());
            }

            tracing::info!(message = %text, "Received message");

            if let Some(commit) = message.commit {
                match commit.operation.as_str() {
                    "create" => save_scrobble(repo, &message.did, commit).await?,
                    _ => tracing::warn!(operation = %commit.operation, "Unknown operation"),
                }
            }
        }
        Ok::<(), Error>(())
    });
    Ok(())
}

async fn save_scrobble(repo: RepoImpl, did: &str, commit: Commit) -> Result<(), Error> {
    if !vec![SCROBBLE_NSID, ARTIST_NSID, ALBUM_NSID, SONG_NSID]
        .contains(&commit.collection.as_str())
    {
        return Ok(());
    }

    match commit.collection.as_str() {
        SCROBBLE_NSID => {
            let record = serde_json::from_value::<ScrobbleRecord>(commit.record)?;
            let uri = format!("at://{}/app.rocksky.scrobble/{}", did, commit.rkey);
            repo.insert_scrobble(did, &uri, record.clone()).await?;
        }
        ARTIST_NSID => {
            let record = serde_json::from_value::<ArtistRecord>(commit.record)?;
            let uri = format!("at://{}/app.rocksky.artist/{}", did, commit.rkey);
            repo.insert_artist(&uri, record).await?;
        }
        ALBUM_NSID => {
            let record = serde_json::from_value::<AlbumRecord>(commit.record)?;
            let uri = format!("at://{}/app.rocksky.album/{}", did, commit.rkey);
            repo.insert_album(&uri, record).await?;
        }
        SONG_NSID => {
            let record = serde_json::from_value::<SongRecord>(commit.record)?;
            let uri = format!("at://{}/app.rocksky.song/{}", did, commit.rkey);
            repo.insert_track(&uri, record).await?;
        }
        _ => {
            tracing::warn!(collection = %commit.collection, "Unknown collection");
        }
    }

    Ok(())
}
