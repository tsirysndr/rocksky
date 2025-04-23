use std::sync::Arc;

use anyhow::Error;
use owo_colors::OwoColorize;
use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;

use crate::{profile::did_to_profile, subscriber::{ALBUM_NSID, ARTIST_NSID, SCROBBLE_NSID, SONG_NSID}, types::{AlbumRecord, ArtistRecord, Commit, ScrobbleRecord, SongRecord}, xata::{album::Album, album_track::AlbumTrack, artist::Artist, artist_album::ArtistAlbum, artist_track::ArtistTrack, track::Track, user::User, user_album::UserAlbum, user_artist::UserArtist, user_track::UserTrack}};

pub async fn save_scrobble(pool: Arc<Mutex<Pool<Postgres>>>, did: &str, commit: Commit) -> Result<(), Error> {
  // skip unknown collection
  if !vec![
    SCROBBLE_NSID,
    ARTIST_NSID,
    ALBUM_NSID,
    SONG_NSID,
  ].contains(&commit.collection.as_str()) {
    return Ok(());
  }

  let pool = pool.lock().await;

  match commit.operation.as_str() {
    "create" => {
      if commit.collection == SCROBBLE_NSID {
        let mut tx = pool.begin().await?;
        let scrobble_record: ScrobbleRecord = serde_json::from_value(commit.record.clone())?;

        let album_id = save_album(&mut tx, scrobble_record.clone(), did).await?;
        let artist_id = save_artist(&mut tx,  scrobble_record.clone()).await?;
        let track_id = save_track(&mut tx,  scrobble_record.clone(), did).await?;

        save_album_track(&mut tx, &album_id, &track_id).await?;
        save_artist_track(&mut tx, &artist_id, &track_id).await?;
        save_artist_album(&mut tx, &artist_id, &album_id).await?;

        let uri = format!("at://{}/app.rocksky.scrobble/{}", did, commit.rkey);

        let user_id = save_user(&mut tx, did).await?;

        println!("Saving scrobble: {} ", format!("{} - {} - {}", scrobble_record.title, scrobble_record.artist, scrobble_record.album).magenta());

        sqlx::query(r#"
          INSERT INTO scrobbles (
            album_id,
            artist_id,
            track_id,
            uri,
            user_id,
            timestamp,
          ) VALUES ($1, $2, $3, $4, $5, $6)
        "#)
          .bind(album_id)
          .bind(artist_id)
          .bind(track_id)
          .bind(uri)
          .bind(user_id)
          .bind(scrobble_record.created_at)
          .execute(&mut *tx).await?;

        tx.commit().await?;
      }

      if commit.collection == ARTIST_NSID {
        let mut tx = pool.begin().await?;

        let user_id = save_user(&mut tx, did).await?;
        let uri = format!("at://{}/app.rocksky.artist/{}", did, commit.rkey);

        let artist_record: ArtistRecord = serde_json::from_value(commit.record.clone())?;
        save_user_artist(&mut tx, &user_id, artist_record.clone(), &uri).await?;
        update_artist_uri(&mut tx, &user_id, artist_record, &uri).await?;

        tx.commit().await?;
      }

      if commit.collection == ALBUM_NSID {
        let mut tx = pool.begin().await?;
        let user_id = save_user(&mut tx, did).await?;
        let uri = format!("at://{}/app.rocksky.album/{}", did, commit.rkey);

        let album_record: AlbumRecord = serde_json::from_value(commit.record.clone())?;
        save_user_album(&mut tx, &user_id, album_record.clone(), &uri).await?;
        update_album_uri(&mut tx, &user_id, album_record, &uri).await?;

        tx.commit().await?;
      }

      if commit.collection == SONG_NSID {
        let mut tx = pool.begin().await?;

        let user_id = save_user(&mut tx, did).await?;
        let uri = format!("at://{}/app.rocksky.song/{}", did, commit.rkey);

        let song_record: SongRecord = serde_json::from_value(commit.record.clone())?;
        save_user_track(&mut tx, &user_id, song_record.clone(), &uri).await?;
        update_track_uri(&mut tx, &user_id, song_record, &uri).await?;

        tx.commit().await?;
      }

    },
    _ => {
      println!("Unsupported operation: {}", commit.operation);
    }
  }
  Ok(())
}


pub async fn save_user(tx: &mut sqlx::Transaction<'_, Postgres>, did: &str) -> Result<String, Error> {
  let profile = did_to_profile(did).await?;

  // Check if the user exists in the database
  let mut users: Vec<User> = sqlx::query_as("SELECT * FROM users WHERE did = $1")
    .bind(did)
    .fetch_all(&mut **tx)
    .await?;

  // If the user does not exist, create a new user
  if users.is_empty() {
    let avatar = profile.avatar.map(|blob| format!("https://cdn.bsky.app/img/avatar/plain/{}/{}@{}", did, blob.r#ref.link, blob.mime_type.split('/').last().unwrap_or("jpeg")));
    sqlx::query("INSERT INTO users (display_name, did, handle, avatar) VALUES ($1, $2, $3, $4)")
      .bind(profile.display_name)
      .bind(did)
      .bind(profile.handle)
      .bind(avatar)
      .execute(&mut **tx).await?;

    users = sqlx::query_as("SELECT * FROM users WHERE did = $1")
      .bind(did)
      .fetch_all(&mut **tx)
      .await?;
  }

  Ok(users[0].xata_id.clone())
}

pub async fn save_track(tx: &mut sqlx::Transaction<'_, Postgres>, scrobble_record: ScrobbleRecord, did: &str) -> Result<String, Error> {
  let uri: Option<String> = None;
  let hash = sha256::digest(
    format!(
      "{} - {} - {}",
      scrobble_record.title,
      scrobble_record.artist,
      scrobble_record.album)
    .to_lowercase()
  );

  let tracks: Vec<Track> = sqlx::query_as("SELECT * FROM tracks WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  if !tracks.is_empty() {
    return Ok(tracks[0].xata_id.clone());
  }

  sqlx::query(r#"
    INSERT INTO tracks (
      title,
      artist,
      album,
      album_art,
      album_artist,
      track_number,
      duration,
      mb_id,
      composer,
      lyrics,
      disc_number,
      sha256,
      copyright_message,
      uri,
      spotify_link,
      label
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
    )
  "#)
  .bind(scrobble_record.title)
  .bind(scrobble_record.artist)
  .bind(scrobble_record.album)
  .bind(scrobble_record.album_art.map(|x| format!("https://cdn.bsky.app/img/feed_thumbnail/plain/{}/{}@{}", did, x.r#ref.link, x.mime_type.split('/').last().unwrap_or("jpeg"))))
  .bind(scrobble_record.album_artist)
  .bind(scrobble_record.track_number)
  .bind(scrobble_record.duration)
  .bind(scrobble_record.mbid)
  .bind(scrobble_record.composer)
  .bind(scrobble_record.lyrics)
  .bind(scrobble_record.disc_number)
  .bind(&hash)
  .bind(scrobble_record.copyright_message)
  .bind(uri)
  .bind(scrobble_record.spotify_link)
  .bind(scrobble_record.label)
  .execute(&mut **tx).await?;

  let tracks: Vec<Track> = sqlx::query_as("SELECT * FROM tracks WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  Ok(tracks[0].xata_id.clone())
}

pub async fn save_album(tx: &mut sqlx::Transaction<'_, Postgres>, scrobble_record: ScrobbleRecord, did: &str) -> Result<String, Error> {
  let hash = sha256::digest(format!(
      "{} - {}",
      scrobble_record.album,
      scrobble_record.album_artist
    )
    .to_lowercase()
  );

  let albums: Vec<Album> = sqlx::query_as("SELECT * FROM albums WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  if !albums.is_empty() {
    println!("Album already exists: {}", albums[0].title.magenta());
    return Ok(albums[0].xata_id.clone());
  }

  println!("Saving album: {}", scrobble_record.album.magenta());

  let uri: Option<String> = None;
  let artist_uri: Option<String> = None;
  sqlx::query(r#"
    INSERT INTO albums (
      title,
      artist,
      album_art,
      year,
      release_date,
      sha256,
      uri,
      artist_uri
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8
    )
  "#)
  .bind(scrobble_record.album)
  .bind(scrobble_record.album_artist)
  .bind(scrobble_record.album_art.map(|x| format!("https://cdn.bsky.app/img/feed_thumbnail/plain/{}/{}@{}", did, x.r#ref.link, x.mime_type.split('/').last().unwrap_or("jpeg"))))
  .bind(scrobble_record.year)
  .bind(scrobble_record.release_date)
  .bind(&hash)
  .bind(uri)
  .bind(artist_uri)
  .execute(&mut **tx).await?;

  let albums: Vec<Album> = sqlx::query_as("SELECT * FROM albums WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  Ok(albums[0].xata_id.clone())
}

pub async fn save_artist(tx: &mut sqlx::Transaction<'_, Postgres>, scrobble_record: ScrobbleRecord) -> Result<String, Error> {
  let hash = sha256::digest(scrobble_record.album_artist.to_lowercase());
  let artists: Vec<Artist> = sqlx::query_as("SELECT * FROM artists WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  if !artists.is_empty() {
    println!("Artist already exists: {}", artists[0].name.magenta());
    return Ok(artists[0].xata_id.clone());
  }

  println!("Saving artist: {}", scrobble_record.album_artist.magenta());

  let uri: Option<String> = None;
  let picture = "";
  sqlx::query(r#"
    INSERT INTO artists (
      name,
      sha256,
      uri,
      picture
    ) VALUES (
      $1, $2, $3, $4
    )
  "#)
  .bind(scrobble_record.artist)
  .bind(&hash)
  .bind(uri)
  .bind(picture)
  .execute(&mut **tx).await?;

  let artists: Vec<Artist> = sqlx::query_as("SELECT * FROM artists WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  Ok(artists[0].xata_id.clone())
}

pub async fn save_album_track(tx: &mut sqlx::Transaction<'_, Postgres>, album_id: &str, track_id: &str) -> Result<(), Error> {
  let album_tracks : Vec<AlbumTrack> = sqlx::query_as("SELECT * FROM album_tracks WHERE album_id = $1 AND track_id = $2")
    .bind(album_id)
    .bind(track_id)
    .fetch_all(&mut **tx)
    .await?;

  if !album_tracks.is_empty() {
    println!("Album track already exists: {}", format!("{} - {}", album_id, track_id).magenta());
    return Ok(());
  }

  println!("Saving album track: {}", format!("{} - {}", album_id, track_id).magenta());

  sqlx::query(r#"
    INSERT INTO album_tracks (
      album_id,
      track_id
    ) VALUES (
      $1, $2
    )
  "#)
  .bind(album_id)
  .bind(track_id)
  .execute(&mut **tx).await?;
  Ok(())
}

pub async fn save_artist_track(tx: &mut sqlx::Transaction<'_, Postgres>, artist_id: &str, track_id: &str) -> Result<(), Error> {
  let artist_tracks : Vec<ArtistTrack> = sqlx::query_as("SELECT * FROM artist_tracks WHERE artist_id = $1 AND track_id = $2")
    .bind(artist_id)
    .bind(track_id)
    .fetch_all(&mut **tx)
    .await?;

  if !artist_tracks.is_empty() {
    println!("Artist track already exists: {}", format!("{} - {}", artist_id, track_id).magenta());
    return Ok(());
  }

  println!("Saving artist track: {}", format!("{} - {}", artist_id, track_id).magenta());

  sqlx::query(r#"
    INSERT INTO artist_tracks (
      artist_id,
      track_id
    ) VALUES (
      $1, $2
    )
  "#)
  .bind(artist_id)
  .bind(track_id)
  .execute(&mut **tx).await?;
  Ok(())
}

pub async fn save_artist_album(tx: &mut sqlx::Transaction<'_, Postgres>, artist_id: &str, album_id: &str) -> Result<(), Error> {
  let artist_albums : Vec<ArtistAlbum> = sqlx::query_as("SELECT * FROM artist_albums WHERE artist_id = $1 AND album_id = $2")
    .bind(artist_id)
    .bind(album_id)
    .fetch_all(&mut **tx)
    .await?;

  if !artist_albums.is_empty() {
    println!("Artist album already exists: {}", format!("{} - {}", artist_id, album_id).magenta());
    return Ok(());
  }

  println!("Saving artist album: {}", format!("{} - {}", artist_id, album_id).magenta());

  sqlx::query(r#"
    INSERT INTO artist_albums (
      artist_id,
      album_id
    ) VALUES (
      $1, $2
    )
  "#)
  .bind(artist_id)
  .bind(album_id)
  .execute(&mut **tx).await?;
  Ok(())
}


pub async fn save_user_artist(tx: &mut sqlx::Transaction<'_, Postgres>, user_id: &str, record: ArtistRecord, uri: &str) -> Result<(), Error> {
  let hash = sha256::digest(record.name.to_lowercase());

  let mut artists: Vec<Artist> = sqlx::query_as("SELECT * FROM artists WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  let users: Vec<User> = sqlx::query_as("SELECT * FROM users WHERE xata_id = $1")
    .bind(user_id)
    .fetch_all(&mut **tx)
    .await?;

  let artist_id: &str;

  match artists.is_empty() {
    true => {
      println!("Saving artist: {}", record.name.magenta());
      let did = users[0].did.clone();
      sqlx::query(r#"
        INSERT INTO artists (
          name,
          sha256,
          uri,
          picture
        ) VALUES (
          $1, $2, $3, $4
        )
      "#)
      .bind(record.name)
      .bind(&hash)
      .bind(uri)
      .bind(record.picture.map(|x| format!("https://cdn.bsky.app/img/avatar/plain/{}/{}@{}", did, x.r#ref.link, x.mime_type.split('/').last().unwrap_or("jpeg"))))
      .execute(&mut **tx).await?;

      artists = sqlx::query_as("SELECT * FROM artists WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;
      artist_id = &artists[0].xata_id;
    },
    false => {
      artist_id = &artists[0].xata_id;
    }
  };

  let user_artists: Vec<UserArtist> = sqlx::query_as("SELECT * FROM user_artists WHERE user_id = $1 AND artist_id = $2")
    .bind(user_id)
    .bind(artist_id)
    .fetch_all(&mut **tx)
    .await?;

  if !user_artists.is_empty() {
    println!("User artist already exists: {}", format!("{} - {}", user_id, artist_id).magenta());
    sqlx::query(r#"
      UPDATE user_artists
      SET scrobbles = scrobbles + 1,
          uri = $3
      WHERE user_id = $1 AND artist_id = $2
    "#)
    .bind(user_id)
    .bind(artist_id)
    .bind(uri)
    .execute(&mut **tx).await?;
    return Ok(());
  }

  println!("Saving user artist: {}", format!("{} - {}", user_id, artist_id).magenta());

  sqlx::query(r#"
    INSERT INTO user_artists (
      user_id,
      artist_id,
      uri,
      scrobbles
    ) VALUES (
      $1, $2, $3, $4
    )
  "#)
  .bind(user_id)
  .bind(artist_id)
  .bind(uri)
  .bind(1)
  .execute(&mut **tx).await?;
  Ok(())
}

pub async fn save_user_album(tx: &mut sqlx::Transaction<'_, Postgres>, user_id: &str, record: AlbumRecord, uri: &str) -> Result<(), Error> {
  let users: Vec<User> = sqlx::query_as("SELECT * FROM users WHERE xata_id = $1")
    .bind(user_id)
    .fetch_all(&mut **tx)
    .await?;

  let hash = sha256::digest(format!(
      "{} - {}",
      record.title,
      record.artist
    )
    .to_lowercase()
  );
  let mut albums: Vec<Album> = sqlx::query_as("SELECT * FROM albums WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  let album_id: &str;

  match albums.is_empty() {
    true => {
      println!("Saving album: {}", record.title.magenta());
      let did = users[0].did.clone();
      sqlx::query(r#"
        INSERT INTO albums (
          title,
          artist,
          album_art,
          year,
          release_date,
          sha256,
          uri
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        )
      "#)
      .bind(record.title)
      .bind(record.artist)
      .bind(record.album_art.map(|x| format!("https://cdn.bsky.app/img/feed_thumbnail/plain/{}/{}@{}", did, x.r#ref.link, x.mime_type.split('/').last().unwrap_or("jpeg"))))
      .bind(record.year)
      .bind(record.release_date)
      .bind(&hash)
      .bind(uri)
      .execute(&mut **tx).await?;

      albums = sqlx::query_as("SELECT * FROM albums WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;
      album_id = &albums[0].xata_id;
    },
    false => {
      album_id = &albums[0].xata_id;
    }
  };

  let user_albums: Vec<UserAlbum> = sqlx::query_as("SELECT * FROM user_albums WHERE user_id = $1 AND album_id = $2")
    .bind(user_id)
    .bind(album_id)
    .fetch_all(&mut **tx)
    .await?;

  if !user_albums.is_empty() {
    println!("User album already exists: {}", format!("{} - {}", user_id, album_id).magenta());
    sqlx::query(r#"
      UPDATE user_albums
      SET scrobbles = scrobbles + 1,
          uri = $3
      WHERE user_id = $1 AND album_id = $2
    "#)
    .bind(user_id)
    .bind(album_id)
    .bind(uri)
    .execute(&mut **tx).await?;
    return Ok(());
  }

  println!("Saving user album: {}", format!("{} - {}", user_id, album_id).magenta());

  sqlx::query(r#"
    INSERT INTO user_albums (
      user_id,
      album_id,
      uri,
      scrobbles
    ) VALUES (
      $1, $2, $3, $4
    )
  "#)
  .bind(user_id)
  .bind(album_id)
  .bind(uri)
  .bind(1)
  .execute(&mut **tx).await?;
  Ok(())
}

pub async fn save_user_track(tx: &mut sqlx::Transaction<'_, Postgres>, user_id: &str, record: SongRecord, uri: &str) -> Result<(), Error> {
  let hash = sha256::digest(format!(
      "{} - {} - {}",
      record.title,
      record.artist,
      record.album
    )
    .to_lowercase()
  );

  let mut tracks: Vec<Track> = sqlx::query_as("SELECT * FROM tracks WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  let users: Vec<User> = sqlx::query_as("SELECT * FROM users WHERE xata_id = $1")
    .bind(user_id)
    .fetch_all(&mut **tx)
    .await?;

  let track_id: &str;

  match tracks.is_empty() {
    true => {
      println!("Saving track: {}", record.title.magenta());
      let did = users[0].did.clone();
      sqlx::query(r#"
        INSERT INTO tracks (
          title,
          artist,
          album,
          album_art,
          album_artist,
          track_number,
          duration,
          mb_id,
          composer,
          lyrics,
          disc_number,
          sha256,
          copyright_message,
          uri,
          spotify_link,
          label
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
      "#)
      .bind(record.title)
      .bind(record.artist)
      .bind(record.album)
      .bind(record.album_art.map(|x| format!("https://cdn.bsky.app/img/feed_thumbnail/plain/{}/{}@{}", did, x.r#ref.link, x.mime_type.split('/').last().unwrap_or("jpeg"))))
      .bind(record.album_artist)
      .bind(record.track_number)
      .bind(record.duration)
      .bind(record.mbid)
      .bind(record.composer)
      .bind(record.lyrics)
      .bind(record.disc_number)
      .bind(&hash)
      .bind(record.copyright_message)
      .bind(uri)
      .bind(record.spotify_link)
      .bind(record.label)
      .execute(&mut **tx).await?;

      tracks = sqlx::query_as("SELECT * FROM tracks WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;

      track_id = &tracks[0].xata_id;
    },
    false => {
      track_id = &tracks[0].xata_id;
    }
  }

  let user_tracks: Vec<UserTrack> = sqlx::query_as("SELECT * FROM user_tracks WHERE user_id = $1 AND track_id = $2")
    .bind(user_id)
    .bind(track_id)
    .fetch_all(&mut **tx)
    .await?;

  if !user_tracks.is_empty() {
    println!("User track already exists: {}", format!("{} - {}", user_id, track_id).magenta());
    sqlx::query(r#"
      UPDATE user_tracks
      SET scrobbles = scrobbles + 1,
          uri = $3
      WHERE user_id = $1 AND track_id = $2
    "#)
    .bind(user_id)
    .bind(track_id)
    .bind(uri)
    .execute(&mut **tx).await?;
    return Ok(());
  }

  println!("Saving user track: {}", format!("{} - {}", user_id, track_id).magenta());

  sqlx::query(r#"
    INSERT INTO user_tracks (
      user_id,
      track_id,
      uri,
      scrobbles
    ) VALUES (
      $1, $2, $3, $4
    )
  "#)
  .bind(user_id)
  .bind(track_id)
  .bind(uri)
  .bind(1)
  .execute(&mut **tx).await?;

  Ok(())
}

pub async fn update_artist_uri(tx: &mut sqlx::Transaction<'_, Postgres>, user_id: &str, record: ArtistRecord, uri: &str) -> Result<(), Error> {
  let hash = sha256::digest(record.name.to_lowercase());
  let artists: Vec<Artist> = sqlx::query_as("SELECT * FROM artists WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  if artists.is_empty() {
    println!("Artist not found: {}", record.name.magenta());
    return Ok(());
  }

  let artist_id = &artists[0].xata_id;

  sqlx::query(r#"
    UPDATE user_artists
    SET uri = $3
    WHERE user_id = $1 AND artist_id = $2
  "#)
  .bind(user_id)
  .bind(artist_id)
  .bind(uri)
  .execute(&mut **tx).await?;

  sqlx::query(r#"
    UPDATE tracks
    SET artist_uri = $2
    WHERE artist_uri IS NULL AND album_artist = $1
  "#)
  .bind(&record.name)
  .bind(uri)
  .execute(&mut **tx).await?;

  sqlx::query(r#"
    UPDATE artists
    SET uri = $2
    WHERE sha256 = $1
  "#)
  .bind(&hash)
  .bind(uri)
  .execute(&mut **tx).await?;

  sqlx::query(r#"
    UPDATE albums
    SET artist_uri = $2
    WHERE artist_uri IS NULL AND artist = $1
  "#)
  .bind(&record.name)
  .bind(uri)
  .execute(&mut **tx).await?;
  Ok(())
}

pub async fn update_album_uri(tx: &mut sqlx::Transaction<'_, Postgres>, user_id: &str, record: AlbumRecord, uri: &str) -> Result<(), Error> {
  let hash = sha256::digest(format!(
      "{} - {}",
      record.title,
      record.artist
    )
    .to_lowercase()
  );
  let albums: Vec<Album> = sqlx::query_as("SELECT * FROM albums WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;
  if albums.is_empty() {
    println!("Album not found: {}", record.title.magenta());
    return Ok(());
  }
  let album_id = &albums[0].xata_id;
  sqlx::query(r#"
    UPDATE user_albums
    SET uri = $3
    WHERE user_id = $1 AND album_id = $2
  "#)
  .bind(user_id)
  .bind(album_id)
  .bind(uri)
  .execute(&mut **tx).await?;

  sqlx::query(r#"
    UPDATE tracks
    SET album_uri = $2
    WHERE album_uri IS NULL AND album = $1
  "#)
  .bind(record.title)
  .bind(uri)
  .execute(&mut **tx).await?;

  sqlx::query(r#"
    UPDATE albums
    SET uri = $2
    WHERE sha256 = $1
  "#)
  .bind(&hash)
  .bind(uri)
  .execute(&mut **tx).await?;

  Ok(())
}

pub async fn update_track_uri(tx: &mut sqlx::Transaction<'_, Postgres>, user_id: &str, record: SongRecord, uri: &str) -> Result<(), Error> {
  let hash = sha256::digest(format!(
      "{} - {} - {}",
      record.title,
      record.artist,
      record.album
    )
    .to_lowercase()
  );
  let tracks: Vec<Track> = sqlx::query_as("SELECT * FROM tracks WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  if tracks.is_empty() {
    println!("Track not found: {}", record.title.magenta());
    return Ok(());
  }

  let track_id = &tracks[0].xata_id;
  sqlx::query(r#"
    UPDATE user_tracks
    SET uri = $3
    WHERE user_id = $1 AND track_id = $2
  "#)
  .bind(user_id)
  .bind(track_id)
  .bind(uri)
  .execute(&mut **tx).await?;

  sqlx::query(r#"
    UPDATE tracks
    SET uri = $2
    WHERE sha256 = $1 AND uri IS NULL
  "#)
  .bind(&hash)
  .bind(uri)
  .execute(&mut **tx).await?;

  Ok(())
}

