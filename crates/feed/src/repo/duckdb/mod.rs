use std::sync::Arc;

use crate::repo::duckdb::{
    album::AlbumRepo, artist::ArtistRepo, scrobble::ScrobbleRepo, track::TrackRepo,
};

use super::Repo;
use anyhow::Error;
use async_trait::async_trait;
use tokio::sync::Mutex;

pub mod album;
pub mod artist;
pub mod scrobble;
pub mod track;
pub mod user;

pub struct DuckdbRepo {
    pub album: AlbumRepo,
    pub atist: ArtistRepo,
    pub scrobble: ScrobbleRepo,
    pub track: TrackRepo,
}

impl DuckdbRepo {
    pub async fn new() -> Result<Self, Error> {
        let conn = duckdb::Connection::open("./rocksky-seed.ddb")?;
        let conn = Arc::new(Mutex::new(conn));
        Ok(Self {
            album: AlbumRepo::new(conn.clone()),
            atist: ArtistRepo::new(conn.clone()),
            scrobble: ScrobbleRepo::new(conn.clone()),
            track: TrackRepo::new(conn.clone()),
        })
    }
}

#[async_trait]
impl Repo for DuckdbRepo {
    async fn insert_album(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn insert_artist(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn insert_scrobble(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn insert_track(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn insert_user(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn get_albums(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn get_artists(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn get_scrobbles(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn get_tracks(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn get_users(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn get_album(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn get_artist(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn get_track(self) -> Result<(), anyhow::Error> {
        todo!()
    }

    async fn get_user(self) -> Result<(), anyhow::Error> {
        todo!()
    }
}
