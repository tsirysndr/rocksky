use anyhow::Error;
use async_trait::async_trait;

use crate::{
    repo::{duckdb::DuckdbRepo, postgres::PostgresRepo},
    types::{AlbumRecord, ArtistRecord, ScrobbleRecord, SongRecord},
};

pub mod duckdb;
pub mod postgres;

#[async_trait]
pub trait Repo: Send + Sync + Clone {
    async fn insert_album(self, uri: &str, record: AlbumRecord) -> Result<(), Error>;
    async fn insert_artist(self, uri: &str, record: ArtistRecord) -> Result<(), Error>;
    async fn insert_scrobble(
        self,
        did: &str,
        uri: &str,
        record: ScrobbleRecord,
    ) -> Result<(), Error>;
    async fn insert_track(self, uri: &str, record: SongRecord) -> Result<(), Error>;
    async fn insert_user(self, did: &str) -> Result<(), Error>;
    async fn get_albums(self) -> Result<(), Error>;
    async fn get_artists(self) -> Result<(), Error>;
    async fn get_scrobbles(self) -> Result<(), Error>;
    async fn get_tracks(self) -> Result<(), Error>;
    async fn get_users(self) -> Result<(), Error>;
    async fn get_album(self) -> Result<(), Error>;
    async fn get_artist(self) -> Result<(), Error>;
    async fn get_track(self) -> Result<(), Error>;
    async fn get_user(self) -> Result<(), Error>;
    async fn create_tables(self) -> Result<(), Error>;
}

pub enum RepoImpl {
    Duckdb(DuckdbRepo),
    Postgres(PostgresRepo),
}

impl Clone for RepoImpl {
    fn clone(&self) -> Self {
        match self {
            RepoImpl::Duckdb(repo) => RepoImpl::Duckdb(repo.clone()),
            RepoImpl::Postgres(repo) => RepoImpl::Postgres(repo.clone()),
        }
    }
}

#[async_trait]
impl Repo for RepoImpl {
    async fn insert_album(self, uri: &str, record: AlbumRecord) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.insert_album(uri, record).await,
            RepoImpl::Postgres(repo) => repo.insert_album(uri, record).await,
        }
    }

    async fn insert_artist(self, uri: &str, record: ArtistRecord) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.insert_artist(uri, record).await,
            RepoImpl::Postgres(repo) => repo.insert_artist(uri, record).await,
        }
    }

    async fn insert_scrobble(
        self,
        did: &str,
        uri: &str,
        record: ScrobbleRecord,
    ) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.insert_scrobble(did, uri, record).await,
            RepoImpl::Postgres(repo) => repo.insert_scrobble(did, uri, record).await,
        }
    }

    async fn insert_track(self, uri: &str, record: SongRecord) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.insert_track(uri, record).await,
            RepoImpl::Postgres(repo) => repo.insert_track(uri, record).await,
        }
    }

    async fn insert_user(self, did: &str) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.insert_user(did).await,
            RepoImpl::Postgres(repo) => repo.insert_user(did).await,
        }
    }

    async fn get_albums(self) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.get_albums().await,
            RepoImpl::Postgres(repo) => repo.get_albums().await,
        }
    }

    async fn get_artists(self) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.get_artists().await,
            RepoImpl::Postgres(repo) => repo.get_artists().await,
        }
    }

    async fn get_scrobbles(self) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.get_scrobbles().await,
            RepoImpl::Postgres(repo) => repo.get_scrobbles().await,
        }
    }
    async fn get_tracks(self) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.get_tracks().await,
            RepoImpl::Postgres(repo) => repo.get_tracks().await,
        }
    }
    async fn get_users(self) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.get_users().await,
            RepoImpl::Postgres(repo) => repo.get_users().await,
        }
    }
    async fn get_album(self) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.get_album().await,
            RepoImpl::Postgres(repo) => repo.get_album().await,
        }
    }
    async fn get_artist(self) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.get_artist().await,
            RepoImpl::Postgres(repo) => repo.get_artist().await,
        }
    }
    async fn get_track(self) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.get_track().await,
            RepoImpl::Postgres(repo) => repo.get_track().await,
        }
    }
    async fn get_user(self) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.get_user().await,
            RepoImpl::Postgres(repo) => repo.get_user().await,
        }
    }
    async fn create_tables(self) -> Result<(), Error> {
        match self {
            RepoImpl::Duckdb(repo) => repo.create_tables().await,
            RepoImpl::Postgres(repo) => repo.create_tables().await,
        }
    }
}
