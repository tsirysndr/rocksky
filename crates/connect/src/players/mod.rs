use anyhow::Error;
use async_trait::async_trait;
use owo_colors::OwoColorize;
use tokio::sync::mpsc::Sender;

pub mod jellyfin;
pub mod kodi;
pub mod mopidy;
pub mod mpd;
pub mod mpris;
pub mod vlc;

pub const SUPPORTED_PLAYERS: [&str; 6] = ["jellyfin", "kodi", "mopidy", "mpd", "mpris", "vlc"];

#[async_trait]
pub trait Player {
    async fn play(&self) -> Result<(), Error>;
    async fn pause(&self) -> Result<(), Error>;
    async fn next(&self) -> Result<(), Error>;
    async fn previous(&self) -> Result<(), Error>;
    async fn seek(&self, position: u64) -> Result<(), Error>;
    async fn broadcast_now_playing(&self, tx: Sender<String>) -> Result<(), Error>;
    async fn broadcast_status(&self, tx: Sender<String>) -> Result<(), Error>;
}

pub fn get_current_player() -> Result<Box<dyn Player + Send + Sync>, Error> {
    let player_type = std::env::var("ROCKSKY_PLAYER");
    if player_type.is_err() {
        return Err(Error::msg(format!(
            "{} environment variable not set",
            "ROCKSKY_PLAYER".green()
        )));
    }

    let player_type = player_type.unwrap();

    match player_type.as_str() {
        "jellyfin" => Ok(Box::new(jellyfin::new())),
        "kodi" => Ok(Box::new(kodi::new()?)),
        "mopidy" => Ok(Box::new(mopidy::new())),
        "mpd" => Ok(Box::new(mpd::new())),
        "mpris" => Ok(Box::new(mpris::new())),
        "vlc" => Ok(Box::new(vlc::new())),
        _ => Err(Error::msg(format!(
            "Unsupported player type: {}",
            player_type.magenta()
        ))),
    }
}
