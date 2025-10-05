use std::sync::Arc;
use std::sync::Mutex;

use crate::{
    repo::duckdb::{
        album::save_album, artist::save_artist, scrobble::save_scrobble, track::save_track,
        user::save_user,
    },
    types::{AlbumRecord, ArtistRecord, ScrobbleRecord, SongRecord},
};

use super::Repo;
use crate::r2d2_duckdb::DuckDBConnectionManager;
use anyhow::Error;
use async_trait::async_trait;
use tokio::sync::mpsc::Sender;

pub mod album;
pub mod artist;
pub mod scrobble;
pub mod track;
pub mod user;

pub const DB_PATH: &str = "./rocksky-feed.ddb";

#[derive(Debug)]
enum SaveMessage {
    Album {
        uri: String,
        record: AlbumRecord,
    },
    Artist {
        uri: String,
        record: ArtistRecord,
    },
    Scrobble {
        did: String,
        uri: String,
        record: ScrobbleRecord,
    },
    Track {
        uri: String,
        record: SongRecord,
    },
    User {
        did: String,
    },
}

#[derive(Clone)]
pub struct DuckdbRepo {
    pool: r2d2::Pool<DuckDBConnectionManager>,
    save_tx: Sender<SaveMessage>,
}

impl DuckdbRepo {
    pub async fn new() -> Result<Self, Error> {
        let (save_tx, mut save_rx) = tokio::sync::mpsc::channel::<SaveMessage>(100);

        let manager = DuckDBConnectionManager::file(DB_PATH);
        let pool = r2d2::Pool::builder().build(manager)?;

        let pool_clone = pool.clone();

        tokio::spawn(async move {
            let mutex = Arc::new(Mutex::new(()));
            while let Some(msg) = save_rx.recv().await {
                let result = match msg {
                    SaveMessage::Album { uri, record } => {
                        save_album(pool_clone.clone(), mutex.clone(), &uri, record).await
                    }
                    SaveMessage::Artist { uri, record } => {
                        save_artist(pool_clone.clone(), mutex.clone(), &uri, record).await
                    }
                    SaveMessage::Scrobble { did, uri, record } => {
                        save_scrobble(pool_clone.clone(), mutex.clone(), &did, &uri, record).await
                    }
                    SaveMessage::Track { uri, record } => {
                        save_track(pool_clone.clone(), mutex.clone(), &uri, record).await
                    }
                    SaveMessage::User { did } => {
                        save_user(pool_clone.clone(), mutex.clone(), &did).await
                    }
                };

                if let Err(e) = result {
                    eprintln!("Error processing save message: {:?}", e);
                }
            }
        });

        Ok(Self { pool, save_tx })
    }
}

#[async_trait]
impl Repo for DuckdbRepo {
    async fn insert_album(self, uri: &str, record: AlbumRecord) -> Result<(), anyhow::Error> {
        self.save_tx
            .send(SaveMessage::Album {
                uri: uri.to_string(),
                record,
            })
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send album save message: {}", e))?;
        Ok(())
    }

    async fn insert_artist(self, uri: &str, record: ArtistRecord) -> Result<(), anyhow::Error> {
        self.save_tx
            .send(SaveMessage::Artist {
                uri: uri.to_string(),
                record,
            })
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send artist save message: {}", e))?;
        Ok(())
    }

    async fn insert_scrobble(
        self,
        did: &str,
        uri: &str,
        record: ScrobbleRecord,
    ) -> Result<(), anyhow::Error> {
        self.save_tx
            .send(SaveMessage::Scrobble {
                did: did.to_string(),
                uri: uri.to_string(),
                record,
            })
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send scrobble save message: {}", e))?;
        Ok(())
    }

    async fn insert_track(self, uri: &str, record: SongRecord) -> Result<(), anyhow::Error> {
        self.save_tx
            .send(SaveMessage::Track {
                uri: uri.to_string(),
                record,
            })
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send track save message: {}", e))?;
        Ok(())
    }

    async fn insert_user(self, did: &str) -> Result<(), anyhow::Error> {
        self.save_tx
            .send(SaveMessage::User {
                did: did.to_string(),
            })
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send user save message: {}", e))?;
        Ok(())
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

    async fn create_tables(self) -> Result<(), anyhow::Error> {
        let conn = self.pool.get()?;
        conn.execute_batch(
            "BEGIN;
      CREATE TABLE IF NOT EXISTS artists (
          id VARCHAR PRIMARY KEY,
          name VARCHAR NOT NULL,
          biography TEXT,
          born DATE,
          born_in VARCHAR,
          died DATE,
          picture VARCHAR,
          sha256 VARCHAR UNIQUE NOT NULL,
          spotify_link VARCHAR,
          tidal_link VARCHAR,
          youtube_link VARCHAR,
          apple_music_link VARCHAR,
          uri VARCHAR UNIQUE,
          tags VARCHAR[],
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      );
      CREATE TABLE IF NOT EXISTS albums (
          id VARCHAR PRIMARY KEY,
          title VARCHAR NOT NULL,
          artist VARCHAR NOT NULL,
          release_date DATE,
          album_art VARCHAR,
          year INTEGER,
          spotify_link VARCHAR,
          tidal_link VARCHAR,
          youtube_link VARCHAR,
          apple_music_link VARCHAR,
          sha256 VARCHAR UNIQUE NOT NULL,
          uri VARCHAR UNIQUE,
          artist_uri VARCHAR,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      );
      CREATE TABLE IF NOT EXISTS tracks (
          id VARCHAR PRIMARY KEY,
          title VARCHAR,
          artist VARCHAR,
          album_artist VARCHAR,
          album_art VARCHAR,
          album VARCHAR,
          track_number INTEGER,
          duration INTEGER,
          mb_id VARCHAR,
          youtube_link VARCHAR,
          spotify_link VARCHAR,
          tidal_link VARCHAR,
          apple_music_link VARCHAR,
          sha256 VARCHAR UNIQUE NOT NULL,
          lyrics TEXT,
          composer VARCHAR,
          genre VARCHAR,
          disc_number INTEGER,
          copyright_message VARCHAR,
          label VARCHAR,
          uri VARCHAR UNIQUE,
          artist_uri VARCHAR,
          album_uri VARCHAR,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      );
      CREATE TABLE IF NOT EXISTS album_tracks (
          id VARCHAR PRIMARY KEY,
          album_id VARCHAR,
          track_id VARCHAR,
          FOREIGN KEY (album_id) REFERENCES albums(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
      );
      CREATE TABLE IF NOT EXISTS users (
          id VARCHAR PRIMARY KEY,
          display_name VARCHAR,
          did VARCHAR UNIQUE NOT NULL,
          handle VARCHAR UNIQUE NOT NULL,
          avatar VARCHAR,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      );
      CREATE TABLE IF NOT EXISTS playlists (
          id VARCHAR PRIMARY KEY,
          name VARCHAR NOT NULL,
          description TEXT,
          picture VARCHAR,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          uri VARCHAR UNIQUE,
          created_by VARCHAR NOT NULL,
          FOREIGN KEY (created_by) REFERENCES users(id),
      );
      CREATE TABLE IF NOT EXISTS playlist_tracks (
          id VARCHAR PRIMARY KEY,
          playlist_id VARCHAR NOT NULL,
          track_id VARCHAR NOT NULL,
          added_by VARCHAR,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (playlist_id) REFERENCES playlists(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
      );
      CREATE TABLE IF NOT EXISTS user_tracks (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR NOT NULL,
          track_id VARCHAR NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
      );
      CREATE TABLE IF NOT EXISTS user_albums (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR,
          album_id VARCHAR,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (album_id) REFERENCES albums(id),
      );
      CREATE TABLE IF NOT EXISTS user_artists (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR NOT NULL,
          artist_id VARCHAR NOT NULL,
          created_at TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (artist_id) REFERENCES artists(id),
      );
      CREATE TABLE IF NOT EXISTS user_playlists (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR NOT NULL,
          playlist_id VARCHAR NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (playlist_id) REFERENCES playlists(id),
      );
      CREATE TABLE IF NOT EXISTS loved_tracks (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR NOT NULL,
          track_id VARCHAR NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
      );
      CREATE TABLE IF NOT EXISTS artist_tracks (
          id VARCHAR PRIMARY KEY,
          artist_id VARCHAR NOT NULL,
          track_id VARCHAR NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
      );
      CREATE TABLE IF NOT EXISTS artist_albums (
          id VARCHAR PRIMARY KEY,
          artist_id VARCHAR NOT NULL,
          album_id VARCHAR NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id),
          FOREIGN KEY (album_id) REFERENCES albums(id),
      );
      CREATE TABLE IF NOT EXISTS album_tracks (
          id VARCHAR PRIMARY KEY,
          album_id VARCHAR NOT NULL,
          track_id VARCHAR NOT NULL,
          FOREIGN KEY (album_id) REFERENCES albums(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
      );
      CREATE TABLE IF NOT EXISTS scrobbles (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR NOT NULL,
          track_id VARCHAR NOT NULL,
          album_id VARCHAR NOT NULL,
          artist_id VARCHAR NOT NULL,
          uri VARCHAR UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
          FOREIGN KEY (album_id) REFERENCES albums(id),
          FOREIGN KEY (artist_id) REFERENCES artists(id),
      );
      COMMIT;
  ",
        )?;

        Ok(())
    }
}
