use std::{env, sync::Arc};

use anyhow::Error;
use async_trait::async_trait;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::Mutex;

use crate::{
    repo::postgres::{
        album::AlbumRepo, artist::ArtistRepo, scrobble::ScrobbleRepo, track::TrackRepo,
        user::UserRepo,
    },
    types::{AlbumRecord, ArtistRecord, ScrobbleRecord, SongRecord},
};

use super::Repo;

pub mod album;
pub mod artist;
pub mod scrobble;
pub mod track;
pub mod user;

#[derive(Clone)]
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
    async fn insert_album(self, uri: &str, record: AlbumRecord) -> Result<(), anyhow::Error> {
        self.album.save_album(uri, record).await
    }

    async fn insert_artist(self, uri: &str, record: ArtistRecord) -> Result<(), anyhow::Error> {
        self.artist.save_artist(uri, record).await
    }

    async fn insert_scrobble(
        self,
        did: &str,
        uri: &str,
        record: ScrobbleRecord,
    ) -> Result<(), anyhow::Error> {
        self.scrobble.save_scrobble(did, uri, record).await
    }

    async fn insert_track(self, uri: &str, record: SongRecord) -> Result<(), anyhow::Error> {
        self.track.save_track(uri, record).await
    }

    async fn insert_user(self, did: &str) -> Result<(), anyhow::Error> {
        self.user.save_user(did).await
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

    async fn create_tables(self) -> Result<(), Error> {
        todo!()
    }
}
