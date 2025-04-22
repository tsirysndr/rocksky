use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::{profile::did_to_profile, subscriber::{ALBUM_NSID, ARTIST_NSID, SCROBBLE_NSID, SONG_NSID}, types::{AlbumRecord, ArtistRecord, Commit, ScrobbleRecord, SongRecord}, xata::{album_track::AlbumTrack, artist::Artist, track::{self, Track}, user::User}};

pub async fn save_scrobble(pool: &Pool<Postgres>, did: &str, commit: Commit) -> Result<(), Error> {
  // skip unknown collection
  if !vec![
    SCROBBLE_NSID,
  ].contains(&commit.collection.as_str()) {
    return Ok(());
  }

  match commit.operation.as_str() {
    "create" => {
      if commit.collection == SCROBBLE_NSID {
        let mut tx = pool.begin().await?;
        let scrobble_record: ScrobbleRecord = serde_json::from_value(commit.record.clone())?;

        let album_id = save_album(&mut tx, scrobble_record.clone()).await?;
        let artist_id = save_artist(&mut tx,  scrobble_record.clone()).await?;
        let track_id = save_track(&mut tx,  scrobble_record.clone()).await?;

        save_album_track(&mut tx, &album_id, &track_id).await?;
        save_artist_track(&mut tx, &artist_id, &track_id).await?;
        save_artist_album(&mut tx, &artist_id, &album_id).await?;

        let uri = format!("at://{}/app.rocksky.scrobble/{}", did, commit.rkey);

        let user_id = save_user(&mut tx, did).await?;

        sqlx::query(r#"
          INSERT INTO scrobbles (
            album_id,
            artist_id,
            track_id,
            uri,
            user_id,
          ) VALUES ($1, $2, $3, $4, $5)
        "#)
          .bind(album_id)
          .bind(artist_id)
          .bind(track_id)
          .bind(uri)
          .bind(user_id)
          .execute(&mut *tx).await?;

        tx.commit().await?;
      }

      if commit.collection == ARTIST_NSID {
        let mut tx = pool.begin().await?;

        let user_id = save_user(&mut tx, did).await?;

        let artist_record: ArtistRecord = serde_json::from_value(commit.record.clone())?;
        save_user_artist(&mut tx, &user_id, artist_record).await?;

        tx.commit().await?;
      }

      if commit.collection == ALBUM_NSID {
        let mut tx = pool.begin().await?;
        let user_id = save_user(&mut tx, did).await?;

        let album_record: AlbumRecord = serde_json::from_value(commit.record.clone())?;
        save_user_album(&mut tx, &user_id, album_record).await?;

        tx.commit().await?;
      }

      if commit.collection == SONG_NSID {
        let mut tx = pool.begin().await?;

        let user_id = save_user(&mut tx, did).await?;

        let song_record: SongRecord = serde_json::from_value(commit.record.clone())?;
        save_user_track(&mut tx, &user_id, song_record).await?;

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

pub async fn save_track(tx: &mut sqlx::Transaction<'_, Postgres>, scrobble_record: ScrobbleRecord) -> Result<String, Error> {
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

  let did = "";
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
      label,
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
  .bind(scrobble_record.composer)
  .bind(scrobble_record.lyrics)
  .bind(scrobble_record.disc_number)
  .bind(hash)
  .bind(scrobble_record.copyright_message)
  .bind(uri)
  .bind(scrobble_record.spotify_link)
  .bind(scrobble_record.label)
  .execute(&mut **tx).await?;
  todo!()
}

pub async fn save_album(tx: &mut sqlx::Transaction<'_, Postgres>, scrobble_record: ScrobbleRecord) -> Result<String, Error> {
  let hash = sha256::digest(format!(
      "{} - {}",
      scrobble_record.album,
      scrobble_record.album_artist
    )
    .to_lowercase()
  );

  let albums: Vec<Artist> = sqlx::query_as("SELECT * FROM albums WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  if !albums.is_empty() {
    return Ok(albums[0].xata_id.clone());
  }

  let uri: Option<String> = None;
  let artist_uri: Option<String> = None;
  let did = "";
  sqlx::query(r#"
    INSERT INTO albums (
      title,
      artist,
      album_art,
      year,
      release_date,
      sha256,
      uri,
      artist_uri,
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8
    )
  "#)
  .bind(scrobble_record.album)
  .bind(scrobble_record.album_artist)
  .bind(scrobble_record.album_art.map(|x| format!("https://cdn.bsky.app/img/feed_thumbnail/plain/{}/{}@{}", did, x.r#ref.link, x.mime_type.split('/').last().unwrap_or("jpeg"))))
  .bind(scrobble_record.year)
  .bind(scrobble_record.release_date)
  .bind(hash)
  .bind(uri)
  .bind(artist_uri)
  .execute(&mut **tx).await?;
  todo!()
}

pub async fn save_artist(tx: &mut sqlx::Transaction<'_, Postgres>, scrobble_record: ScrobbleRecord) -> Result<String, Error> {
  let hash = sha256::digest(scrobble_record.album_artist.to_lowercase());
  let artists: Vec<Artist> = sqlx::query_as("SELECT * FROM artists WHERE sha256 = $1")
    .bind(&hash)
    .fetch_all(&mut **tx)
    .await?;

  if !artists.is_empty() {
    return Ok(artists[0].xata_id.clone());
  }

  let uri: Option<String> = None;
  let picture = "";
  sqlx::query(r#"
    INSERT INTO artists (
      name,
      sha256,
      uri,
      picture,
    ) VALUES (
      $1, $2, $3, $4
    )
  "#)
  .bind(scrobble_record.artist)
  .bind(hash)
  .bind(uri)
  .bind(picture)
  .execute(&mut **tx).await?;
  todo!()
}

pub async fn save_album_track(tx: &mut sqlx::Transaction<'_, Postgres>, album_id: &str, track_id: &str) -> Result<(), Error> {
  let album_tracks : Vec<AlbumTrack> = sqlx::query_as("SELECT * FROM album_tracks WHERE album_id = $1 AND track_id = $2")
    .bind(album_id)
    .bind(track_id)
    .fetch_all(&mut **tx)
    .await?;

  if !album_tracks.is_empty() {
    return Ok(());
  }

  sqlx::query(r#"
    INSERT INTO album_tracks (
      album_id,
      track_id,
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
  let artist_tracks : Vec<AlbumTrack> = sqlx::query_as("SELECT * FROM artist_tracks WHERE artist_id = $1 AND track_id = $2")
    .bind(artist_id)
    .bind(track_id)
    .fetch_all(&mut **tx)
    .await?;

  if !artist_tracks.is_empty() {
    return Ok(());
  }

  sqlx::query(r#"
    INSERT INTO artist_tracks (
      artist_id,
      track_id,
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
  let artist_albums : Vec<AlbumTrack> = sqlx::query_as("SELECT * FROM artist_albums WHERE artist_id = $1 AND album_id = $2")
    .bind(artist_id)
    .bind(album_id)
    .fetch_all(&mut **tx)
    .await?;

  if !artist_albums.is_empty() {
    return Ok(());
  }

  sqlx::query(r#"
    INSERT INTO artist_albums (
      artist_id,
      album_id,
    ) VALUES (
      $1, $2
    )
  "#)
  .bind(artist_id)
  .bind(album_id)
  .execute(&mut **tx).await?;
  Ok(())
}


pub async fn save_user_artist(tx: &mut sqlx::Transaction<'_, Postgres>, user_id: &str, record: ArtistRecord) -> Result<(), Error> {
  Ok(())
}

pub async fn save_user_album(tx: &mut sqlx::Transaction<'_, Postgres>, user_id: &str, record: AlbumRecord) -> Result<(), Error> {
  Ok(())
}

pub async fn save_user_track(tx: &mut sqlx::Transaction<'_, Postgres>, user_id: &str, record: SongRecord) -> Result<(), Error> {
  Ok(())
}
