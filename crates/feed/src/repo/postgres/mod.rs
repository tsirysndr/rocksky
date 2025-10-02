use std::{env, sync::Arc};

use anyhow::Error;
use async_trait::async_trait;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::Mutex;

use crate::repo::postgres::{
    album::AlbumRepo, artist::ArtistRepo, scrobble::ScrobbleRepo, track::TrackRepo, user::UserRepo,
};

use super::Repo;

pub mod album;
pub mod artist;
pub mod scrobble;
pub mod track;
pub mod user;

pub struct PostgresRepo {
    pub album: AlbumRepo,
    pub artist: ArtistRepo,
    pub scrobble: ScrobbleRepo,
    pub track: TrackRepo,
    pub user: UserRepo,
}

impl PostgresRepo {
    pub async fn new() -> Result<Self, Error> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&env::var("XATA_POSTGRES_URL")?)
            .await?;
        let pool = Arc::new(Mutex::new(pool));
        Ok(Self {
            album: AlbumRepo::new(pool.clone()),
            artist: ArtistRepo::new(pool.clone()),
            scrobble: ScrobbleRepo::new(pool.clone()),
            track: TrackRepo::new(pool.clone()),
            user: UserRepo::new(pool.clone()),
        })
    }
}

#[async_trait]
impl Repo for PostgresRepo {
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
