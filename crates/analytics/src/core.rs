use std::sync::{Arc, Mutex};

use anyhow::Error;
use duckdb::{params, Connection};
use owo_colors::OwoColorize;
use sqlx::{Pool, Postgres};

use crate::xata;

pub async fn create_tables(conn: &Connection) -> Result<(), Error> {
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
          sha256 VARCHAR NOT NULL,
          spotify_link VARCHAR,
          tidal_link VARCHAR,
          youtube_link VARCHAR,
          apple_music_link VARCHAR,
          uri VARCHAR,
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
          sha256 VARCHAR NOT NULL,
          uri VARCHAR,
          artist_uri VARCHAR,
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
          sha256 VARCHAR NOT NULL,
          lyrics TEXT,
          composer VARCHAR,
          genre VARCHAR,
          disc_number INTEGER,
          copyright_message VARCHAR,
          label VARCHAR,
          uri VARCHAR,
          artist_uri VARCHAR,
          album_uri VARCHAR,
          created_at TIMESTAMP,
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
          did VARCHAR,
          handle VARCHAR,
          avatar VARCHAR,
      );
      CREATE TABLE IF NOT EXISTS playlists (
          id VARCHAR PRIMARY KEY,
          name VARCHAR,
          description TEXT,
          picture VARCHAR,
          created_at TIMESTAMP,
          updated_at TIMESTAMP,
          uri VARCHAR,
          created_by VARCHAR NOT NULL,
          FOREIGN KEY (created_by) REFERENCES users(id),
      );
      CREATE TABLE IF NOT EXISTS playlist_tracks (
          id VARCHAR PRIMARY KEY,
          playlist_id VARCHAR,
          track_id VARCHAR,
          added_by VARCHAR,
          created_at TIMESTAMP,
          FOREIGN KEY (playlist_id) REFERENCES playlists(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
      );
      CREATE TABLE IF NOT EXISTS user_tracks (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR,
          track_id VARCHAR,
          created_at TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
      );
      CREATE TABLE IF NOT EXISTS user_albums (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR,
          album_id VARCHAR,
          created_at TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (album_id) REFERENCES albums(id),
      );
      CREATE TABLE IF NOT EXISTS user_artists (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR,
          artist_id VARCHAR,
          created_at TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (artist_id) REFERENCES artists(id),
      );
      CREATE TABLE IF NOT EXISTS user_playlists (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR,
          playlist_id VARCHAR,
          created_at TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (playlist_id) REFERENCES playlists(id),
      );
      CREATE TABLE IF NOT EXISTS loved_tracks (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR,
          track_id VARCHAR,
          created_at TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
      );
      CREATE TABLE IF NOT EXISTS artist_tracks (
          id VARCHAR PRIMARY KEY,
          artist_id VARCHAR,
          track_id VARCHAR,
          created_at TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
      );
      CREATE TABLE IF NOT EXISTS artist_albums (
          id VARCHAR PRIMARY KEY,
          artist_id VARCHAR,
          album_id VARCHAR,
          created_at TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id),
          FOREIGN KEY (album_id) REFERENCES albums(id),
      );
      CREATE TABLE IF NOT EXISTS album_tracks (
          id VARCHAR PRIMARY KEY,
          album_id VARCHAR,
          track_id VARCHAR,
          FOREIGN KEY (album_id) REFERENCES albums(id),
          FOREIGN KEY (track_id) REFERENCES tracks(id),
      );
      CREATE TABLE IF NOT EXISTS scrobbles (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR,
          track_id VARCHAR,
          album_id VARCHAR,
          artist_id VARCHAR,
          uri VARCHAR,
          created_at TIMESTAMP,
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

pub async fn load_tracks(conn: Arc<Mutex<Connection>>, pool: &Pool<Postgres>) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let tracks: Vec<xata::track::Track> = sqlx::query_as(
        r#"
      SELECT * FROM tracks
  "#,
    )
    .fetch_all(pool)
    .await?;

    for (i, track) in tracks.clone().into_iter().enumerate() {
        println!(
            "track {} - {} - {}",
            i,
            track.title.bright_green(),
            track.artist
        );
        match conn.execute(
            "INSERT INTO tracks (
              id,
              title,
              artist,
              album_artist,
              album_art,
              album,
              track_number,
              duration,
              mb_id,
              youtube_link,
              spotify_link,
              tidal_link,
              apple_music_link,
              sha256,
              lyrics,
              composer,
              genre,
              disc_number,
              copyright_message,
              label,
              uri,
              artist_uri,
              album_uri,
              created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                track.xata_id,
                track.title,
                track.artist,
                track.album_artist,
                track.album_art,
                track.album,
                track.track_number,
                track.duration,
                track.mb_id,
                track.youtube_link,
                track.spotify_link,
                track.tidal_link,
                track.apple_music_link,
                track.sha256,
                track.lyrics,
                track.composer,
                track.genre,
                track.disc_number,
                track.copyright_message,
                track.label,
                track.uri,
                track.artist_uri,
                track.album_uri,
                track.xata_createdat,
            ],
        ) {
            Ok(_) => (),
            Err(e) => println!("error: {}", e),
        }
    }

    println!("tracks: {:?}", tracks.len());
    Ok(())
}

pub async fn load_artists(
    conn: Arc<Mutex<Connection>>,
    pool: &Pool<Postgres>,
) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let artists: Vec<xata::artist::Artist> = sqlx::query_as(
        r#"
      SELECT * FROM artists
  "#,
    )
    .fetch_all(pool)
    .await?;

    for (i, artist) in artists.clone().into_iter().enumerate() {
        println!("artist {} - {}", i, artist.name.bright_green());
        match conn.execute(
            "INSERT INTO artists (
              id,
              name,
              biography,
              born,
              born_in,
              died,
              picture,
              sha256,
              spotify_link,
              tidal_link,
              youtube_link,
              apple_music_link,
              uri
          ) VALUES (?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?)",
            params![
                artist.xata_id,
                artist.name,
                artist.biography,
                artist.born,
                artist.born_in,
                artist.died,
                artist.picture,
                artist.sha256,
                artist.spotify_link,
                artist.tidal_link,
                artist.youtube_link,
                artist.apple_music_link,
                artist.uri,
            ],
        ) {
            Ok(_) => (),
            Err(e) => println!("error: {}", e),
        }
    }

    println!("artists: {:?}", artists.len());
    Ok(())
}

pub async fn load_albums(conn: Arc<Mutex<Connection>>, pool: &Pool<Postgres>) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let albums: Vec<xata::album::Album> = sqlx::query_as(
        r#"
      SELECT * FROM albums
  "#,
    )
    .fetch_all(pool)
    .await?;

    for (i, album) in albums.clone().into_iter().enumerate() {
        println!("album {} - {}", i, album.title.bright_green());
        match conn.execute(
            "INSERT INTO albums (
              id,
              title,
              artist,
              release_date,
              album_art,
              year,
              spotify_link,
              tidal_link,
              youtube_link,
              apple_music_link,
              sha256,
              uri,
              artist_uri
          ) VALUES (?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?)",
            params![
                album.xata_id,
                album.title,
                album.artist,
                album.release_date,
                album.album_art,
                album.year,
                album.spotify_link,
                album.tidal_link,
                album.youtube_link,
                album.apple_music_link,
                album.sha256,
                album.uri,
                album.artist_uri,
            ],
        ) {
            Ok(_) => (),
            Err(e) => println!("error: {}", e),
        }
    }

    println!("albums: {:?}", albums.len());
    Ok(())
}

pub async fn load_users(conn: Arc<Mutex<Connection>>, pool: &Pool<Postgres>) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let users: Vec<xata::user::User> = sqlx::query_as(
        r#"
      SELECT * FROM users
  "#,
    )
    .fetch_all(pool)
    .await?;

    for (i, user) in users.clone().into_iter().enumerate() {
        println!("user {} - {}", i, user.display_name.bright_green());
        match conn.execute(
            "INSERT INTO users (
              id,
              display_name,
              did,
              handle,
              avatar
          ) VALUES (?,
              ?,
              ?,
              ?,
              ?)",
            params![
                user.xata_id,
                user.display_name,
                user.did,
                user.handle,
                user.avatar,
            ],
        ) {
            Ok(_) => (),
            Err(e) => println!("error: {}", e),
        }
    }

    println!("users: {:?}", users.len());
    Ok(())
}

pub async fn load_scrobbles(
    conn: Arc<Mutex<Connection>>,
    pool: &Pool<Postgres>,
) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let scrobbles: Vec<xata::scrobble::Scrobble> = sqlx::query_as(
        r#"
      SELECT * FROM scrobbles
  "#,
    )
    .fetch_all(pool)
    .await?;

    for (i, scrobble) in scrobbles.clone().into_iter().enumerate() {
        println!(
            "scrobble {} - {}",
            i,
            match scrobble.uri.clone() {
                Some(uri) => uri.to_string(),
                None => "None".to_string(),
            }
            .bright_green()
        );
        match conn.execute(
            "INSERT INTO scrobbles (
              id,
              user_id,
              track_id,
              album_id,
              artist_id,
              uri,
              created_at
          ) VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?
            )",
            params![
                scrobble.xata_id,
                scrobble.user_id,
                scrobble.track_id,
                scrobble.album_id,
                scrobble.artist_id,
                scrobble.uri,
                scrobble.xata_createdat,
            ],
        ) {
            Ok(_) => (),
            Err(e) => println!("error: {}", e),
        }
    }

    println!("scrobbles: {:?}", scrobbles.len());
    Ok(())
}

pub async fn load_album_tracks(
    conn: Arc<Mutex<Connection>>,
    pool: &Pool<Postgres>,
) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let album_tracks: Vec<xata::album_track::AlbumTrack> = sqlx::query_as(
        r#"
      SELECT * FROM album_tracks
  "#,
    )
    .fetch_all(pool)
    .await?;

    for (i, album_track) in album_tracks.clone().into_iter().enumerate() {
        println!(
            "album_track {} - {} - {}",
            i,
            album_track.album_id.bright_green(),
            album_track.track_id
        );
        match conn.execute(
            "INSERT INTO album_tracks (
              id,
              album_id,
              track_id
          ) VALUES (?,
              ?,
              ?)",
            params![
                album_track.xata_id,
                album_track.album_id,
                album_track.track_id,
            ],
        ) {
            Ok(_) => (),
            Err(e) => println!("error: {}", e),
        }
    }
    println!("album_tracks: {:?}", album_tracks.len());
    Ok(())
}

pub async fn load_loved_tracks(
    conn: Arc<Mutex<Connection>>,
    pool: &Pool<Postgres>,
) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let loved_tracks: Vec<xata::user_track::UserTrack> = sqlx::query_as(
        r#"
      SELECT * FROM loved_tracks
  "#,
    )
    .fetch_all(pool)
    .await?;

    for (i, loved_track) in loved_tracks.clone().into_iter().enumerate() {
        println!(
            "loved_track {} - {} - {}",
            i,
            loved_track.user_id.bright_green(),
            loved_track.track_id
        );
        match conn.execute(
            "INSERT INTO loved_tracks (
              id,
              user_id,
              track_id,
              created_at
          ) VALUES (?,
              ?,
              ?,
              ?)",
            params![
                loved_track.xata_id,
                loved_track.user_id,
                loved_track.track_id,
                loved_track.xata_createdat,
            ],
        ) {
            Ok(_) => (),
            Err(e) => println!("error: {}", e),
        }
    }

    println!("loved_tracks: {:?}", loved_tracks.len());
    Ok(())
}

pub async fn load_artist_tracks(
    conn: Arc<Mutex<Connection>>,
    pool: &Pool<Postgres>,
) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let artist_tracks: Vec<xata::artist_track::ArtistTrack> = sqlx::query_as(
        r#"
      SELECT * FROM artist_tracks
  "#,
    )
    .fetch_all(pool)
    .await?;

    for (i, artist_track) in artist_tracks.clone().into_iter().enumerate() {
        println!(
            "artist_track {} - {} - {}",
            i,
            artist_track.artist_id.bright_green(),
            artist_track.track_id
        );
        match conn.execute(
            "INSERT INTO artist_tracks (id, artist_id, track_id, created_at) VALUES (?, ?, ?, ?)",
            params![
                artist_track.xata_id,
                artist_track.artist_id,
                artist_track.track_id,
                artist_track.xata_createdat,
            ],
        ) {
            Ok(_) => (),
            Err(e) => println!("error: {}", e),
        }
    }

    println!("artist_tracks: {:?}", artist_tracks.len());
    Ok(())
}

pub async fn load_artist_albums(
    conn: Arc<Mutex<Connection>>,
    pool: &Pool<Postgres>,
) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let artist_albums: Vec<xata::artist_album::ArtistAlbum> = sqlx::query_as(
        r#"
        SELECT * FROM artist_albums
    "#,
    )
    .fetch_all(pool)
    .await?;

    for (i, artist_album) in artist_albums.clone().into_iter().enumerate() {
        println!(
            "artist_albums {} - {} - {}",
            i,
            artist_album.artist_id.bright_green(),
            artist_album.album_id
        );
        match conn.execute(
            "INSERT INTO artist_albums (id, artist_id, album_id, created_at) VALUES (?, ?, ?, ?)",
            params![
                artist_album.xata_id,
                artist_album.artist_id,
                artist_album.album_id,
                artist_album.xata_createdat,
            ],
        ) {
            Ok(_) => (),
            Err(e) => println!("error: {}", e),
        }
    }

    println!("artist_albums: {:?}", artist_albums.len());
    Ok(())
}

pub async fn load_user_albums(
    conn: Arc<Mutex<Connection>>,
    pool: &Pool<Postgres>,
) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let user_albums: Vec<xata::user_album::UserAlbum> = sqlx::query_as(
        r#"
      SELECT * FROM user_albums
  "#,
    )
    .fetch_all(pool)
    .await?;

    for (i, user_album) in user_albums.clone().into_iter().enumerate() {
        println!(
            "user_album {} - {} - {}",
            i,
            user_album.user_id.bright_green(),
            user_album.album_id
        );
        match conn.execute(
            "INSERT INTO user_albums (id, user_id, album_id, created_at) VALUES (?, ?, ?, ?)",
            params![
                user_album.xata_id,
                user_album.user_id,
                user_album.album_id,
                user_album.xata_createdat,
            ],
        ) {
            Ok(_) => (),
            Err(e) => println!("error: {}", e),
        }
    }

    println!("user_albums: {:?}", user_albums.len());
    Ok(())
}

pub async fn load_user_artists(
    conn: Arc<Mutex<Connection>>,
    pool: &Pool<Postgres>,
) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let user_artists: Vec<xata::user_artist::UserArtist> = sqlx::query_as(
        r#"
      SELECT * FROM user_artists
  "#,
    )
    .fetch_all(pool)
    .await?;

    for (i, user_artist) in user_artists.clone().into_iter().enumerate() {
        println!(
            "user_artist {} - {} - {}",
            i,
            user_artist.user_id.bright_green(),
            user_artist.artist_id
        );
        match conn.execute(
            "INSERT INTO user_artists (id, user_id, artist_id, created_at) VALUES (?, ?, ?, ?)",
            params![
                user_artist.xata_id,
                user_artist.user_id,
                user_artist.artist_id,
                user_artist.xata_createdat,
            ],
        ) {
            Ok(_) => (),
            Err(e) => println!("error: {}", e),
        }
    }

    println!("user_artists: {:?}", user_artists.len());
    Ok(())
}

pub async fn load_user_tracks(
    conn: Arc<Mutex<Connection>>,
    pool: &Pool<Postgres>,
) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let user_tracks: Vec<xata::user_track::UserTrack> = sqlx::query_as(
        r#"
      SELECT * FROM user_tracks
  "#,
    )
    .fetch_all(pool)
    .await?;

    for (i, user_track) in user_tracks.clone().into_iter().enumerate() {
        println!(
            "user_track {} - {} - {}",
            i,
            user_track.user_id.bright_green(),
            user_track.track_id
        );
        match conn.execute(
            "INSERT INTO user_tracks (id, user_id, track_id, created_at) VALUES (?, ?, ?, ?)",
            params![
                user_track.xata_id,
                user_track.user_id,
                user_track.track_id,
                user_track.xata_createdat,
            ],
        ) {
            Ok(_) => (),
            Err(e) => println!("error: {}", e),
        }
    }

    println!("user_tracks: {:?}", user_tracks.len());
    Ok(())
}
