use anyhow::Error;
use async_trait::async_trait;

pub mod duckdb;
pub mod postgres;

#[async_trait]
pub trait Repo {
    async fn insert_album(self) -> Result<(), Error>;
    async fn insert_artist(self) -> Result<(), Error>;
    async fn insert_scrobble(self) -> Result<(), Error>;
    async fn insert_track(self) -> Result<(), Error>;
    async fn insert_user(self) -> Result<(), Error>;
    async fn get_albums(self) -> Result<(), Error>;
    async fn get_artists(self) -> Result<(), Error>;
    async fn get_scrobbles(self) -> Result<(), Error>;
    async fn get_tracks(self) -> Result<(), Error>;
    async fn get_users(self) -> Result<(), Error>;
    async fn get_album(self) -> Result<(), Error>;
    async fn get_artist(self) -> Result<(), Error>;
    async fn get_track(self) -> Result<(), Error>;
    async fn get_user(self) -> Result<(), Error>;
}
