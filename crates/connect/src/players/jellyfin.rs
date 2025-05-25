use super::Player;
use async_trait::async_trait;

use anyhow::Error;
use tokio::sync::mpsc::Sender;
pub struct JellyfinPlayer {}

pub fn new() -> JellyfinPlayer {
    JellyfinPlayer {}
}

#[async_trait]
impl Player for JellyfinPlayer {
    async fn play(&self) -> Result<(), Error> {
        Ok(())
    }

    async fn pause(&self) -> Result<(), Error> {
        Ok(())
    }

    async fn next(&self) -> Result<(), Error> {
        Ok(())
    }

    async fn previous(&self) -> Result<(), Error> {
        Ok(())
    }

    async fn seek(&self, _position: u64) -> Result<(), Error> {
        Ok(())
    }

    async fn broadcast_now_playing(&self, _tx: Sender<String>) -> Result<(), Error> {
        Ok(())
    }

    async fn broadcast_status(&self, _tx: Sender<String>) -> Result<(), Error> {
        Ok(())
    }
}
