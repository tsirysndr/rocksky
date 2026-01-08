use std::sync::Arc;

use anyhow::Error;
use chrono::DateTime;
use owo_colors::OwoColorize;
use serde_json::json;
use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;

use crate::{
    profile::did_to_profile,
    subscriber::{
        ALBUM_NSID, ARTIST_NSID, FEED_GENERATOR_NSID, FOLLOW_NSID, SCROBBLE_NSID, SONG_NSID,
    },
    types::{
        AlbumRecord, ArtistRecord, Commit, FeedGeneratorRecord, FollowRecord, ScrobbleRecord,
        SongRecord,
    },
    webhook::discord::{
        self,
        model::{ScrobbleData, WebhookEnvelope},
    },
    webhook_worker::{push_to_queue, AppState},
    xata::{
        album::Album, album_track::AlbumTrack, artist::Artist, artist_album::ArtistAlbum,
        artist_track::ArtistTrack, track::Track, user::User, user_album::UserAlbum,
        user_artist::UserArtist, user_track::UserTrack,
    },
};

pub async fn save_scrobble(
    state: Arc<Mutex<AppState>>,
    pool: Arc<Mutex<Pool<Postgres>>>,
    nc: Arc<async_nats::Client>,
    did: &str,
    commit: Commit,
) -> Result<(), Error> {
    // skip unknown collection
    if !vec![
        SCROBBLE_NSID,
        ARTIST_NSID,
        ALBUM_NSID,
        SONG_NSID,
        FEED_GENERATOR_NSID,
        FOLLOW_NSID,
    ]
    .contains(&commit.collection.as_str())
    {
        return Ok(());
    }

    let pool = pool.lock().await;

    match commit.operation.as_str() {
        "create" => {
            if commit.collection == SCROBBLE_NSID {
                let mut tx = pool.begin().await?;
                let scrobble_record: ScrobbleRecord =
                    serde_json::from_value(commit.record.clone())?;

                let album_id = save_album(&mut tx, scrobble_record.clone()).await?;
                let artist_id = save_artist(&mut tx, scrobble_record.clone()).await?;
                let track_id = save_track(&mut tx, scrobble_record.clone()).await?;

                save_album_track(&mut tx, &album_id, &track_id).await?;
                save_artist_track(&mut tx, &artist_id, &track_id).await?;
                save_artist_album(&mut tx, &artist_id, &album_id).await?;

                let uri = format!("at://{}/app.rocksky.scrobble/{}", did, commit.rkey);

                let user_id = save_user(&mut tx, did).await?;

                tracing::info!(title = %scrobble_record.title.magenta(), artist = %scrobble_record.artist.magenta(), album = %scrobble_record.album.magenta(), "Saving scrobble");

                sqlx::query(
                    r#"
          INSERT INTO scrobbles (
            album_id,
            artist_id,
            track_id,
            uri,
            user_id,
            timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6)
        "#,
                )
                .bind(album_id)
                .bind(artist_id)
                .bind(track_id)
                .bind(uri)
                .bind(&user_id)
                .bind(
                    DateTime::parse_from_rfc3339(&scrobble_record.created_at)
                        .unwrap()
                        .with_timezone(&chrono::Utc),
                )
                .execute(&mut *tx)
                .await?;

                tx.commit().await?;
                publish_user(&nc, &pool, &user_id).await?;

                let users: Vec<User> =
                    sqlx::query_as::<_, User>("SELECT * FROM users WHERE did = $1")
                        .bind(did)
                        .fetch_all(&*pool)
                        .await?;

                if users.is_empty() {
                    return Err(anyhow::anyhow!(
                        "User with DID {} not found in database",
                        did
                    ));
                }

                // Push to webhook queue (Discord)
                match push_to_queue(
                    state,
                    &WebhookEnvelope {
                        r#type: "scrobble.created".to_string(),
                        id: commit.rkey.clone(),
                        data: ScrobbleData {
                            user: discord::model::User {
                                did: did.to_string(),
                                display_name: users[0].display_name.clone(),
                                handle: users[0].handle.clone(),
                                avatar_url: users[0].avatar.clone(),
                            },
                            track: discord::model::Track {
                                title: scrobble_record.title.clone(),
                                artist: scrobble_record.artist.clone(),
                                album: scrobble_record.album.clone(),
                                duration: scrobble_record.duration,
                                artwork_url: scrobble_record.album_art_url.clone(),
                                spotify_url: scrobble_record.spotify_link.clone(),
                                tidal_url: scrobble_record.tidal_link.clone(),
                                youtube_url: scrobble_record.youtube_link.clone(),
                            },
                            played_at: scrobble_record.created_at.clone(),
                        },
                        delivered_at: Some(chrono::Utc::now().to_rfc3339()),
                    },
                )
                .await
                {
                    Ok(_) => {}
                    Err(e) => {
                        tracing::error!(error = %e, "Failed to push to webhook queue");
                    }
                }
            }

            if commit.collection == ARTIST_NSID {
                let mut tx = pool.begin().await?;

                let user_id = save_user(&mut tx, did).await?;
                let uri = format!("at://{}/app.rocksky.artist/{}", did, commit.rkey);

                let artist_record: ArtistRecord = serde_json::from_value(commit.record.clone())?;
                save_user_artist(&mut tx, &user_id, artist_record.clone(), &uri).await?;
                update_artist_uri(&mut tx, &user_id, artist_record, &uri).await?;

                tx.commit().await?;
                publish_user(&nc, &pool, &user_id).await?;
            }

            if commit.collection == ALBUM_NSID {
                let mut tx = pool.begin().await?;
                let user_id = save_user(&mut tx, did).await?;
                let uri = format!("at://{}/app.rocksky.album/{}", did, commit.rkey);

                let album_record: AlbumRecord = serde_json::from_value(commit.record.clone())?;
                save_user_album(&mut tx, &user_id, album_record.clone(), &uri).await?;
                update_album_uri(&mut tx, &user_id, album_record, &uri).await?;

                tx.commit().await?;
                publish_user(&nc, &pool, &user_id).await?;
            }

            if commit.collection == SONG_NSID {
                let mut tx = pool.begin().await?;

                let user_id = save_user(&mut tx, did).await?;
                let uri = format!("at://{}/app.rocksky.song/{}", did, commit.rkey);

                let song_record: SongRecord = serde_json::from_value(commit.record.clone())?;
                save_user_track(&mut tx, &user_id, song_record.clone(), &uri).await?;
                update_track_uri(&mut tx, &user_id, song_record, &uri).await?;

                tx.commit().await?;
                publish_user(&nc, &pool, &user_id).await?;
            }

            if commit.collection == FEED_GENERATOR_NSID {
                let mut tx = pool.begin().await?;

                let user_id = save_user(&mut tx, did).await?;
                let uri = format!("at://{}/app.rocksky.feed.generator/{}", did, commit.rkey);

                let feed_generator_record: FeedGeneratorRecord =
                    serde_json::from_value(commit.record.clone())?;
                save_feed_generator(&mut tx, &user_id, feed_generator_record, &uri).await?;

                tx.commit().await?;
                publish_user(&nc, &pool, &user_id).await?;
            }

            if commit.collection == FOLLOW_NSID {
                let mut tx = pool.begin().await?;

                let user_id = save_user(&mut tx, did).await?;
                let uri = format!("at://{}/app.rocksky.graph.follow/{}", did, commit.rkey);

                let follow_record: FollowRecord = serde_json::from_value(commit.record)?;
                let subject_user_id = save_user(&mut tx, &follow_record.subject).await?;
                save_follow(&mut tx, did, follow_record, &uri).await?;

                tx.commit().await?;
                publish_user(&nc, &pool, &user_id).await?;
                publish_user(&nc, &pool, &subject_user_id).await?;
            }
        }
        _ => {
            tracing::warn!(operation = %commit.operation, "Unsupported operation");
        }
    }
    Ok(())
}

pub async fn save_user(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    did: &str,
) -> Result<String, Error> {
    let profile = did_to_profile(did).await?;

    // Check if the user exists in the database
    let mut users: Vec<User> = sqlx::query_as("SELECT * FROM users WHERE did = $1")
        .bind(did)
        .fetch_all(&mut **tx)
        .await?;

    // If the user does not exist, create a new user
    if users.is_empty() {
        let avatar = profile.avatar.map(|blob| {
            format!(
                "https://cdn.bsky.app/img/avatar/plain/{}/{}@{}",
                did,
                blob.r#ref.link,
                blob.mime_type.split('/').last().unwrap_or("jpeg")
            )
        });
        sqlx::query(
            "INSERT INTO users (display_name, did, handle, avatar) VALUES ($1, $2, $3, $4)",
        )
        .bind(profile.display_name)
        .bind(did)
        .bind(profile.handle)
        .bind(avatar)
        .execute(&mut **tx)
        .await?;

        users = sqlx::query_as("SELECT * FROM users WHERE did = $1")
            .bind(did)
            .fetch_all(&mut **tx)
            .await?;
    }

    Ok(users[0].xata_id.clone())
}

pub async fn publish_user(
    nc: &async_nats::Client,
    pool: &Pool<Postgres>,
    id: &str,
) -> Result<(), Error> {
    let users: Vec<User> = sqlx::query_as("SELECT * FROM users WHERE xata_id = $1")
        .bind(id)
        .fetch_all(pool)
        .await?;

    if users.is_empty() {
        tracing::warn!(user=%id, "user not found");
        return Ok(());
    }

    let u = &users[0];

    let payload = json!({
        "xata_id": u.xata_id,
        "did": u.did,
        "handle": u.handle,
        "display_name": u.display_name,
        "avatar": u.avatar,
        "xata_createdat": u.xata_createdat.to_rfc3339(),
        "xata_updatedat": u.xata_createdat.to_rfc3339(),
        "xata_version": 0,
    });
    let payload = serde_json::to_string(&payload)?;

    nc.publish("rocksky.user", payload.into()).await?;
    nc.flush().await?;

    Ok(())
}

pub async fn save_track(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    scrobble_record: ScrobbleRecord,
) -> Result<String, Error> {
    let uri: Option<String> = None;
    let hash = sha256::digest(
        format!(
            "{} - {} - {}",
            scrobble_record.title, scrobble_record.artist, scrobble_record.album
        )
        .to_lowercase(),
    );

    let tracks: Vec<Track> = sqlx::query_as("SELECT * FROM tracks WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;

    if !tracks.is_empty() {
        return Ok(tracks[0].xata_id.clone());
    }

    sqlx::query(
        r#"
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
      apple_music_link,
      tidal_link,
      youtube_link,
      label
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
    )
  "#,
    )
    .bind(scrobble_record.title)
    .bind(scrobble_record.artist)
    .bind(scrobble_record.album)
    .bind(scrobble_record.album_art_url)
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
    .bind(scrobble_record.apple_music_link)
    .bind(scrobble_record.tidal_link)
    .bind(scrobble_record.youtube_link)
    .bind(scrobble_record.label)
    .execute(&mut **tx)
    .await?;

    let tracks: Vec<Track> = sqlx::query_as("SELECT * FROM tracks WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;

    Ok(tracks[0].xata_id.clone())
}

pub async fn save_album(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    scrobble_record: ScrobbleRecord,
) -> Result<String, Error> {
    let hash = sha256::digest(
        format!(
            "{} - {}",
            scrobble_record.album, scrobble_record.album_artist
        )
        .to_lowercase(),
    );

    let albums: Vec<Album> = sqlx::query_as("SELECT * FROM albums WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;

    if !albums.is_empty() {
        tracing::info!(name = %albums[0].title.magenta(), "Album already exists");
        return Ok(albums[0].xata_id.clone());
    }

    tracing::info!(name = %scrobble_record.album, "Saving new album");

    let uri: Option<String> = None;
    let artist_uri: Option<String> = None;
    sqlx::query(
        r#"
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
  "#,
    )
    .bind(scrobble_record.album)
    .bind(scrobble_record.album_artist)
    .bind(scrobble_record.album_art_url)
    .bind(scrobble_record.year)
    .bind(scrobble_record.release_date)
    .bind(&hash)
    .bind(uri)
    .bind(artist_uri)
    .execute(&mut **tx)
    .await?;

    let albums: Vec<Album> = sqlx::query_as("SELECT * FROM albums WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;

    Ok(albums[0].xata_id.clone())
}

pub async fn save_artist(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    scrobble_record: ScrobbleRecord,
) -> Result<String, Error> {
    let hash = sha256::digest(scrobble_record.album_artist.to_lowercase());
    let artists: Vec<Artist> = sqlx::query_as("SELECT * FROM artists WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;

    if !artists.is_empty() {
        tracing::info!(name = %scrobble_record.album_artist, "Artist already exists");
        return Ok(artists[0].xata_id.clone());
    }

    tracing::info!(name = %scrobble_record.album_artist, "Saving new artist");

    let uri: Option<String> = None;
    let picture = "";
    sqlx::query(
        r#"
    INSERT INTO artists (
      name,
      sha256,
      uri,
      picture,
      genres
    ) VALUES (
      $1, $2, $3, $4, $5
    )
  "#,
    )
    .bind(scrobble_record.artist)
    .bind(&hash)
    .bind(uri)
    .bind(picture)
    .bind(scrobble_record.tags)
    .execute(&mut **tx)
    .await?;

    let artists: Vec<Artist> = sqlx::query_as("SELECT * FROM artists WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;

    Ok(artists[0].xata_id.clone())
}

pub async fn save_album_track(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    album_id: &str,
    track_id: &str,
) -> Result<(), Error> {
    let album_tracks: Vec<AlbumTrack> =
        sqlx::query_as("SELECT * FROM album_tracks WHERE album_id = $1 AND track_id = $2")
            .bind(album_id)
            .bind(track_id)
            .fetch_all(&mut **tx)
            .await?;

    if !album_tracks.is_empty() {
        tracing::info!(album_id = %album_id, track_id = %track_id, "Album track already exists");
        return Ok(());
    }

    tracing::info!(album_id = %album_id, track_id = %track_id, "Saving album track");

    sqlx::query(
        r#"
    INSERT INTO album_tracks (
      album_id,
      track_id
    ) VALUES (
      $1, $2
    )
  "#,
    )
    .bind(album_id)
    .bind(track_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn save_artist_track(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    artist_id: &str,
    track_id: &str,
) -> Result<(), Error> {
    let artist_tracks: Vec<ArtistTrack> =
        sqlx::query_as("SELECT * FROM artist_tracks WHERE artist_id = $1 AND track_id = $2")
            .bind(artist_id)
            .bind(track_id)
            .fetch_all(&mut **tx)
            .await?;

    if !artist_tracks.is_empty() {
        tracing::info!(artist_id = %artist_id, track_id = %track_id, "Artist track already exists");
        return Ok(());
    }

    tracing::info!(artist_id = %artist_id, track_id = %track_id, "Saving artist track");

    sqlx::query(
        r#"
    INSERT INTO artist_tracks (
      artist_id,
      track_id
    ) VALUES (
      $1, $2
    )
  "#,
    )
    .bind(artist_id)
    .bind(track_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn save_artist_album(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    artist_id: &str,
    album_id: &str,
) -> Result<(), Error> {
    let artist_albums: Vec<ArtistAlbum> =
        sqlx::query_as("SELECT * FROM artist_albums WHERE artist_id = $1 AND album_id = $2")
            .bind(artist_id)
            .bind(album_id)
            .fetch_all(&mut **tx)
            .await?;

    if !artist_albums.is_empty() {
        tracing::info!(artist_id = %artist_id, album_id = %album_id, "Artist album already exists");
        return Ok(());
    }

    tracing::info!(artist_id = %artist_id, album_id = %album_id, "Saving artist album");

    sqlx::query(
        r#"
    INSERT INTO artist_albums (
      artist_id,
      album_id
    ) VALUES (
      $1, $2
    )
  "#,
    )
    .bind(artist_id)
    .bind(album_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn save_user_artist(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    record: ArtistRecord,
    uri: &str,
) -> Result<(), Error> {
    let hash = sha256::digest(record.name.to_lowercase());

    let mut artists: Vec<Artist> = sqlx::query_as("SELECT * FROM artists WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;

    let artist_id: &str;

    match artists.is_empty() {
        true => {
            tracing::info!(name = %record.name, "Artist not found in database, inserting new artist");
            sqlx::query(
                r#"
        INSERT INTO artists (
          name,
          sha256,
          uri,
          picture
        ) VALUES (
          $1, $2, $3, $4
        )
      "#,
            )
            .bind(record.name)
            .bind(&hash)
            .bind(uri)
            .bind(record.picture_url)
            .execute(&mut **tx)
            .await?;

            artists = sqlx::query_as("SELECT * FROM artists WHERE sha256 = $1")
                .bind(&hash)
                .fetch_all(&mut **tx)
                .await?;
            artist_id = &artists[0].xata_id;
        }
        false => {
            artist_id = &artists[0].xata_id;
        }
    };

    let user_artists: Vec<UserArtist> =
        sqlx::query_as("SELECT * FROM user_artists WHERE user_id = $1 AND artist_id = $2")
            .bind(user_id)
            .bind(artist_id)
            .fetch_all(&mut **tx)
            .await?;

    if !user_artists.is_empty() {
        tracing::info!(user_id = %user_id, artist_id = %artist_id, "Updating user artist");
        sqlx::query(
            r#"
      UPDATE user_artists
      SET scrobbles = scrobbles + 1,
          uri = $3
      WHERE user_id = $1 AND artist_id = $2
    "#,
        )
        .bind(user_id)
        .bind(artist_id)
        .bind(uri)
        .execute(&mut **tx)
        .await?;
        return Ok(());
    }

    tracing::info!(user_id = %user_id, artist_id = %artist_id, "Inserting user artist");

    sqlx::query(
        r#"
    INSERT INTO user_artists (
      user_id,
      artist_id,
      uri,
      scrobbles
    ) VALUES (
      $1, $2, $3, $4
    )
  "#,
    )
    .bind(user_id)
    .bind(artist_id)
    .bind(uri)
    .bind(1)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn save_user_album(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    record: AlbumRecord,
    uri: &str,
) -> Result<(), Error> {
    let hash = sha256::digest(format!("{} - {}", record.title, record.artist).to_lowercase());
    let mut albums: Vec<Album> = sqlx::query_as("SELECT * FROM albums WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;

    let album_id: &str;

    match albums.is_empty() {
        true => {
            tracing::info!(title = %record.title, artist = %record.artist, "Album not found in database, inserting new album");
            sqlx::query(
                r#"
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
      "#,
            )
            .bind(record.title)
            .bind(record.artist)
            .bind(record.album_art_url)
            .bind(record.year)
            .bind(record.release_date)
            .bind(&hash)
            .bind(uri)
            .execute(&mut **tx)
            .await?;

            albums = sqlx::query_as("SELECT * FROM albums WHERE sha256 = $1")
                .bind(&hash)
                .fetch_all(&mut **tx)
                .await?;
            album_id = &albums[0].xata_id;
        }
        false => {
            album_id = &albums[0].xata_id;
        }
    };

    let user_albums: Vec<UserAlbum> =
        sqlx::query_as("SELECT * FROM user_albums WHERE user_id = $1 AND album_id = $2")
            .bind(user_id)
            .bind(album_id)
            .fetch_all(&mut **tx)
            .await?;

    if !user_albums.is_empty() {
        tracing::info!(user_id = %user_id, album_id = %album_id, "Updating user album");
        sqlx::query(
            r#"
      UPDATE user_albums
      SET scrobbles = scrobbles + 1,
          uri = $3
      WHERE user_id = $1 AND album_id = $2
    "#,
        )
        .bind(user_id)
        .bind(album_id)
        .bind(uri)
        .execute(&mut **tx)
        .await?;
        return Ok(());
    }

    tracing::info!(user_id = %user_id, album_id = %album_id, "Inserting user album");

    sqlx::query(
        r#"
    INSERT INTO user_albums (
      user_id,
      album_id,
      uri,
      scrobbles
    ) VALUES (
      $1, $2, $3, $4
    )
  "#,
    )
    .bind(user_id)
    .bind(album_id)
    .bind(uri)
    .bind(1)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn save_user_track(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    record: SongRecord,
    uri: &str,
) -> Result<(), Error> {
    let hash = sha256::digest(
        format!("{} - {} - {}", record.title, record.artist, record.album).to_lowercase(),
    );

    let mut tracks: Vec<Track> = sqlx::query_as("SELECT * FROM tracks WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;

    let track_id: &str;

    match tracks.is_empty() {
        true => {
            tracing::info!(title = %record.title, artist = %record.artist, album = %record.album, "Track not found in database, inserting new track");
            sqlx::query(
                r#"
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
      "#,
            )
            .bind(record.title)
            .bind(record.artist)
            .bind(record.album)
            .bind(record.album_art_url)
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
            .execute(&mut **tx)
            .await?;

            tracks = sqlx::query_as("SELECT * FROM tracks WHERE sha256 = $1")
                .bind(&hash)
                .fetch_all(&mut **tx)
                .await?;

            track_id = &tracks[0].xata_id;
        }
        false => {
            track_id = &tracks[0].xata_id;
        }
    }

    let user_tracks: Vec<UserTrack> =
        sqlx::query_as("SELECT * FROM user_tracks WHERE user_id = $1 AND track_id = $2")
            .bind(user_id)
            .bind(track_id)
            .fetch_all(&mut **tx)
            .await?;

    if !user_tracks.is_empty() {
        tracing::info!(user_id = %user_id, track_id = %track_id, "Updating user track");
        sqlx::query(
            r#"
      UPDATE user_tracks
      SET scrobbles = scrobbles + 1,
          uri = $3
      WHERE user_id = $1 AND track_id = $2
    "#,
        )
        .bind(user_id)
        .bind(track_id)
        .bind(uri)
        .execute(&mut **tx)
        .await?;
        return Ok(());
    }

    tracing::info!(user_id = %user_id, track_id = %track_id, "Inserting user track");

    sqlx::query(
        r#"
    INSERT INTO user_tracks (
      user_id,
      track_id,
      uri,
      scrobbles
    ) VALUES (
      $1, $2, $3, $4
    )
  "#,
    )
    .bind(user_id)
    .bind(track_id)
    .bind(uri)
    .bind(1)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn update_artist_uri(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    record: ArtistRecord,
    uri: &str,
) -> Result<(), Error> {
    let hash = sha256::digest(record.name.to_lowercase());
    let artists: Vec<Artist> = sqlx::query_as("SELECT * FROM artists WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;

    if artists.is_empty() {
        tracing::warn!(name = %record.name, "Artist not found in database");
        return Ok(());
    }

    let artist_id = &artists[0].xata_id;

    sqlx::query(
        r#"
    UPDATE user_artists
    SET uri = $3
    WHERE user_id = $1 AND artist_id = $2
  "#,
    )
    .bind(user_id)
    .bind(artist_id)
    .bind(uri)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        r#"
    UPDATE tracks
    SET artist_uri = $2
    WHERE artist_uri IS NULL AND album_artist = $1
  "#,
    )
    .bind(&record.name)
    .bind(uri)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        r#"
    UPDATE artists
    SET uri = $2
    WHERE sha256 = $1 AND uri IS NULL
  "#,
    )
    .bind(&hash)
    .bind(uri)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        r#"
    UPDATE albums
    SET artist_uri = $2
    WHERE artist_uri IS NULL AND artist = $1
  "#,
    )
    .bind(&record.name)
    .bind(uri)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn update_album_uri(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    record: AlbumRecord,
    uri: &str,
) -> Result<(), Error> {
    let hash = sha256::digest(format!("{} - {}", record.title, record.artist).to_lowercase());
    let albums: Vec<Album> = sqlx::query_as("SELECT * FROM albums WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;
    if albums.is_empty() {
        tracing::warn!(title = %record.title, "Album not found in database");
        return Ok(());
    }
    let album_id = &albums[0].xata_id;
    sqlx::query(
        r#"
    UPDATE user_albums
    SET uri = $3
    WHERE user_id = $1 AND album_id = $2
  "#,
    )
    .bind(user_id)
    .bind(album_id)
    .bind(uri)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        r#"
    UPDATE tracks
    SET album_uri = $2
    WHERE album_uri IS NULL AND album = $1
  "#,
    )
    .bind(record.title)
    .bind(uri)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        r#"
    UPDATE albums
    SET uri = $2
    WHERE sha256 = $1 AND uri IS NULL
  "#,
    )
    .bind(&hash)
    .bind(uri)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn update_track_uri(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    record: SongRecord,
    uri: &str,
) -> Result<(), Error> {
    let hash = sha256::digest(
        format!("{} - {} - {}", record.title, record.artist, record.album).to_lowercase(),
    );
    let tracks: Vec<Track> = sqlx::query_as("SELECT * FROM tracks WHERE sha256 = $1")
        .bind(&hash)
        .fetch_all(&mut **tx)
        .await?;

    if tracks.is_empty() {
        tracing::warn!(title = %record.title, "Track not found in database");
        return Ok(());
    }

    let track_id = &tracks[0].xata_id;
    sqlx::query(
        r#"
    UPDATE user_tracks
    SET uri = $3
    WHERE user_id = $1 AND track_id = $2
  "#,
    )
    .bind(user_id)
    .bind(track_id)
    .bind(uri)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        r#"
    UPDATE tracks
    SET uri = $2
    WHERE sha256 = $1 AND uri IS NULL
  "#,
    )
    .bind(&hash)
    .bind(uri)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn save_feed_generator(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    record: FeedGeneratorRecord,
    uri: &str,
) -> Result<(), Error> {
    let did = uri
        .split('/')
        .nth(2)
        .ok_or_else(|| anyhow::anyhow!("Invalid URI: {}", uri))?;
    let avatar = record.avatar.map(|blob| {
        format!(
            "https://cdn.bsky.app/img/avatar/plain/{}/{}@{}",
            did,
            blob.r#ref.link,
            blob.mime_type.split('/').last().unwrap_or("jpeg")
        )
    });

    tracing::info!(user_id = %user_id, display_name = %record.display_name, uri = %uri, "Saving feed generator");

    sqlx::query(
        r#"
    INSERT INTO feeds (
        user_id,
        uri,
        display_name,
        description,
        did,
        avatar
    ) VALUES (
        $1, $2, $3, $4, $5, $6
    )
  "#,
    )
    .bind(user_id)
    .bind(uri)
    .bind(record.display_name)
    .bind(record.description)
    .bind(record.did)
    .bind(avatar)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn save_follow(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    did: &str,
    record: FollowRecord,
    uri: &str,
) -> Result<(), Error> {
    tracing::info!(did = %did, uri = %uri, "Saving follow");

    sqlx::query(
        r#"
    INSERT INTO follows (
        follower_did,
        subject_did,
        uri
    ) VALUES (
        $1, $2, $3
    )
    ON CONFLICT (follower_did, subject_did) DO NOTHING
  "#,
    )
    .bind(did)
    .bind(record.subject)
    .bind(uri)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
