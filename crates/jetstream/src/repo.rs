use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::{profile::did_to_profile, subscriber::{ALBUM_NSID, ARTIST_NSID, LIKE_NSID, PLAYLIST_NSID, SCROBBLE_NSID, SHOUT_NSID, SONG_NSID}, types::{Commit, ScrobbleRecord}, xata::user::User};

pub async fn save_scrobble(pool: &Pool<Postgres>, did: &str, commit: Commit) -> Result<(), Error> {
  // skip unknown collection
  if !vec![
    SCROBBLE_NSID,
    ARTIST_NSID,
    ALBUM_NSID,
    SONG_NSID,
    PLAYLIST_NSID,
    LIKE_NSID,
    SHOUT_NSID,
  ].contains(&commit.collection.as_str()) {
    return Ok(());
  }

  match commit.operation.as_str() {
    "create" => {
      if commit.collection == SCROBBLE_NSID {
        let mut tx = pool.begin().await?;
        let scrobble_record: ScrobbleRecord = serde_json::from_value(commit.record)?;

        let user_id = save_user(&mut tx, did).await?;

        let album_id = save_album(&mut tx, &user_id, scrobble_record.clone()).await?;
        let artist_id = save_artist(&mut tx, &user_id, scrobble_record.clone()).await?;
        let track_id = save_track(&mut tx, &user_id, scrobble_record.clone()).await?;
        let uri = format!("at://{}/app.rocksky.scrobble/{}", did, commit.rkey);

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

        /*
        sqlx::query(r#"
          INSERT INTO tracks (
            track_number,
            disc_number,
            title,
            artist,
            album_artist,
            album,
            duration,
            release_date,
            year,
            genre,
            tags,
            composer,
            lyrics,
            copyright_message,
            wiki,
            album_art,
            youtube_link,
            spotify_link,
            tidal_link,
            apple_music_link,
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        "#)
          .bind(scrobble_record.track_number)
          .bind(scrobble_record.disc_number)
          .bind(scrobble_record.title)
          .bind(scrobble_record.artist)
          .bind(scrobble_record.album_artist)
          .bind(scrobble_record.album)
          .bind(scrobble_record.duration)
          .bind(scrobble_record.release_date)
          .bind(scrobble_record.year)
          .bind(scrobble_record.genre)
          .bind(scrobble_record.tags)
          .bind(scrobble_record.composer)
          .bind(scrobble_record.lyrics)
          .bind(scrobble_record.copyright_message)
          .bind(scrobble_record.wiki)
          .bind(scrobble_record.album_art.map(|x| format!("https://cdn.bsky.app/img/feed_thumbnail/plain/{}/{}@{}", did, x.r#ref.link, x.mime_type.split('/').last().unwrap_or("jpeg"))))
          .bind(scrobble_record.youtube_link)
          .bind(scrobble_record.spotify_link)
          .bind(scrobble_record.tidal_link)
          .bind(scrobble_record.apple_music_link)
          .execute(pool).await?;
        */
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
  let mut users: Vec<User> = sqlx::query_as("SELECT id FROM users WHERE did = $1")
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

    users = sqlx::query_as("SELECT id FROM users WHERE did = $1")
      .bind(did)
      .fetch_all(&mut **tx)
      .await?;
  }

  Ok(users[0].xata_id.clone())
}

pub async fn save_track(tx: &mut sqlx::Transaction<'_, Postgres>, user_id: &str, scrobble_record: ScrobbleRecord) -> Result<String, Error> {
  todo!()
}

pub async fn save_album(tx: &mut sqlx::Transaction<'_, Postgres>, user_id: &str, scrobble_record: ScrobbleRecord) -> Result<String, Error> {
  todo!()
}

pub async fn save_artist(tx: &mut sqlx::Transaction<'_, Postgres>, user_id: &str, scrobble_record: ScrobbleRecord) -> Result<String, Error> {
  todo!()
}
