use std::env;

mod repo;
mod xata;

use anyhow::{Context, Error};
use owo_colors::OwoColorize;
use sqlx::{PgPool, postgres::PgPoolOptions};

const MAX_CONNECTIONS: u32 = 5;
const BATCH_SIZE: usize = 1000;
const BACKUP_URL: &str = "https://backup.rocksky.app/rocksky-backup.sql";
const BACKUP_PATH: &str = "/tmp/rocksky-backup.sql";
#[derive(Clone)]
pub struct DatabasePools {
    pub source: PgPool,
    pub destination: PgPool,
}

pub async fn pull_data() -> Result<(), Error> {
    if env::var("SOURCE_POSTGRES_URL").is_err() {
        tracing::info!(
            backup = %BACKUP_URL.magenta(),
            "SOURCE_POSTGRES_URL not set, downloading backup from Rocksky"
        );
        download_backup().await?;
        return Ok(());
    }

    let pools = setup_database_pools().await?;

    // Sync core entities first
    let album_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_albums(&pools).await }
    });

    let artist_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_artists(&pools).await }
    });

    let track_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_tracks(&pools).await }
    });

    let user_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_users(&pools).await }
    });

    let (album_sync, artist_sync, track_sync, user_sync) =
        tokio::join!(album_sync, artist_sync, track_sync, user_sync);

    album_sync.context("Album sync task failed")??;
    artist_sync.context("Artist sync task failed")??;
    track_sync.context("Track sync task failed")??;
    user_sync.context("User sync task failed")??;

    // Sync relationship entities
    let playlist_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_playlists(&pools).await }
    });

    let loved_track_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_loved_tracks(&pools).await }
    });

    let scrobble_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_scrobbles(&pools).await }
    });

    let (loved_track_sync, playlist_sync, scrobble_sync) =
        tokio::join!(loved_track_sync, playlist_sync, scrobble_sync);
    loved_track_sync.context("Loved track sync task failed")??;
    playlist_sync.context("Playlist sync task failed")??;
    scrobble_sync.context("Scrobble sync task failed")??;

    // Sync junction tables
    let album_track_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_album_tracks(&pools).await }
    });

    let artist_album_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_artist_albums(&pools).await }
    });

    let artist_track_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_artist_tracks(&pools).await }
    });

    let playlist_track_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_playlist_tracks(&pools).await }
    });

    let user_album_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_user_albums(&pools).await }
    });

    let user_artist_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_user_artists(&pools).await }
    });

    let user_track_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_user_tracks(&pools).await }
    });

    let user_playlist_sync = tokio::spawn({
        let pools = pools.clone();
        async move { sync_user_playlists(&pools).await }
    });

    let (
        album_track_sync,
        artist_album_sync,
        artist_track_sync,
        playlist_track_sync,
        user_album_sync,
        user_artist_sync,
        user_track_sync,
        user_playlist_sync,
    ) = tokio::join!(
        album_track_sync,
        artist_album_sync,
        artist_track_sync,
        playlist_track_sync,
        user_album_sync,
        user_artist_sync,
        user_track_sync,
        user_playlist_sync
    );

    album_track_sync.context("Album track sync task failed")??;
    artist_album_sync.context("Artist album sync task failed")??;
    artist_track_sync.context("Artist track sync task failed")??;
    playlist_track_sync.context("Playlist track sync task failed")??;
    user_album_sync.context("User album sync task failed")??;
    user_artist_sync.context("User artist sync task failed")??;
    user_track_sync.context("User track sync task failed")??;
    user_playlist_sync.context("User playlist sync task failed")??;

    Ok(())
}

async fn download_backup() -> Result<(), Error> {
    let _ = tokio::fs::remove_file(BACKUP_PATH).await;

    tokio::process::Command::new("curl")
        .arg("-o")
        .arg(BACKUP_PATH)
        .arg(BACKUP_URL)
        .stderr(std::process::Stdio::inherit())
        .stdout(std::process::Stdio::inherit())
        .spawn()?
        .wait()
        .await?;

    tokio::process::Command::new("psql")
        .arg(&env::var("XATA_POSTGRES_URL")?)
        .arg("-f")
        .arg(BACKUP_PATH)
        .stderr(std::process::Stdio::inherit())
        .stdout(std::process::Stdio::inherit())
        .spawn()?
        .wait()
        .await?;
    Ok(())
}

async fn setup_database_pools() -> Result<DatabasePools, Error> {
    let source = PgPoolOptions::new()
        .max_connections(MAX_CONNECTIONS)
        .connect(&env::var("SOURCE_POSTGRES_URL")?)
        .await?;

    let destination = PgPoolOptions::new()
        .max_connections(MAX_CONNECTIONS)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    Ok(DatabasePools {
        source,
        destination,
    })
}

async fn sync_albums(pools: &DatabasePools) -> Result<(), Error> {
    let total_albums: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM albums")
        .fetch_one(&pools.source)
        .await?;
    let total_albums = total_albums.0;
    tracing::info!(total = %total_albums.magenta(), "Total albums to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_albums).step_by(BATCH_SIZE) {
        let albums =
            repo::album::get_albums(&pools.source, offset as i64, BATCH_SIZE as i64).await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + albums.len() as i64).min(total_albums)).magenta(),
            total = %total_albums.magenta(),
            "Fetched albums"
        );
        for album in &albums {
            tracing::info!(title = %album.title.cyan(), i = %i.magenta(), total = %total_albums.magenta(), "Inserting album");
            repo::album::insert_album(&pools.destination, album).await?;
            i += 1;
        }
    }
    Ok(())
}

async fn sync_artists(pools: &DatabasePools) -> Result<(), Error> {
    let total_artists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM artists")
        .fetch_one(&pools.source)
        .await?;
    let total_artists = total_artists.0;
    tracing::info!(total = %total_artists.magenta(), "Total artists to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_artists).step_by(BATCH_SIZE) {
        let artists =
            repo::artist::get_artists(&pools.source, offset as i64, BATCH_SIZE as i64).await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + artists.len() as i64).min(total_artists)).magenta(),
            total = %total_artists.magenta(),
            "Fetched artists"
        );
        for artist in &artists {
            tracing::info!(name = %artist.name.cyan(), i = %i.magenta(), total = %total_artists.magenta(), "Inserting artist");
            repo::artist::insert_artist(&pools.destination, artist).await?;
            i += 1;
        }
    }
    Ok(())
}

async fn sync_tracks(pools: &DatabasePools) -> Result<(), Error> {
    let total_tracks: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM tracks")
        .fetch_one(&pools.source)
        .await?;
    let total_tracks = total_tracks.0;
    tracing::info!(total = %total_tracks.magenta(), "Total tracks to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_tracks).step_by(BATCH_SIZE) {
        let tracks =
            repo::track::get_tracks(&pools.source, offset as i64, BATCH_SIZE as i64).await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + tracks.len() as i64).min(total_tracks)).magenta(),
            total = %total_tracks.magenta(),
            "Fetched tracks"
        );

        for track in &tracks {
            tracing::info!(title = %track.title.cyan(), i = %i.magenta(), total = %total_tracks.magenta(), "Inserting track");
            match repo::track::insert_track(&pools.destination, track).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert track");
                }
            }
            i += 1;
        }
    }
    Ok(())
}

async fn sync_users(pools: &DatabasePools) -> Result<(), Error> {
    let total_users: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(&pools.source)
        .await?;
    let total_users = total_users.0;
    tracing::info!(total = %total_users.magenta(), "Total users to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_users).step_by(BATCH_SIZE) {
        let users = repo::user::get_users(&pools.source, offset as i64, BATCH_SIZE as i64).await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + users.len() as i64).min(total_users)).magenta(),
            total = %total_users.magenta(),
            "Fetched users"
        );

        for user in &users {
            tracing::info!(handle = %user.handle.cyan(), i = %i.magenta(), total = %total_users.magenta(), "Inserting user");
            match repo::user::insert_user(&pools.destination, user).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert user");
                }
            }
            i += 1;
        }
    }
    Ok(())
}

async fn sync_playlists(pools: &DatabasePools) -> Result<(), Error> {
    let total_playlists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM playlists")
        .fetch_one(&pools.source)
        .await?;
    let total_playlists = total_playlists.0;
    tracing::info!(total = %total_playlists.magenta(), "Total playlists to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_playlists).step_by(BATCH_SIZE) {
        let playlists =
            repo::playlist::get_playlists(&pools.source, offset as i64, BATCH_SIZE as i64).await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + playlists.len() as i64).min(total_playlists)).magenta(),
            total = %total_playlists.magenta(),
            "Fetched playlists"
        );

        for playlist in &playlists {
            tracing::info!(name = %playlist.name.cyan(), i = %i.magenta(), total = %total_playlists.magenta(), "Inserting playlist");
            match repo::playlist::insert_playlist(&pools.destination, playlist).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert playlist");
                }
            }
            i += 1;
        }
    }
    Ok(())
}

async fn sync_loved_tracks(pools: &DatabasePools) -> Result<(), Error> {
    let total_loved_tracks: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM loved_tracks")
        .fetch_one(&pools.source)
        .await?;
    let total_loved_tracks = total_loved_tracks.0;
    tracing::info!(total = %total_loved_tracks.magenta(), "Total loved tracks to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_loved_tracks).step_by(BATCH_SIZE) {
        let loved_tracks =
            repo::loved_track::get_loved_tracks(&pools.source, offset as i64, BATCH_SIZE as i64)
                .await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + loved_tracks.len() as i64).min(total_loved_tracks)).magenta(),
            total = %total_loved_tracks.magenta(),
            "Fetched loved tracks"
        );

        for loved_track in &loved_tracks {
            tracing::info!(user_id = %loved_track.user_id.cyan(), track_id = %loved_track.track_id.magenta(), i = %i.magenta(), total = %total_loved_tracks.magenta(), "Inserting loved track");
            match repo::loved_track::insert_loved_track(&pools.destination, loved_track).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert loved track");
                }
            }
            i += 1;
        }
    }
    Ok(())
}

async fn sync_scrobbles(pools: &DatabasePools) -> Result<(), Error> {
    let total_scrobbles: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM scrobbles")
        .fetch_one(&pools.source)
        .await?;
    let total_scrobbles = total_scrobbles.0;
    tracing::info!(total = %total_scrobbles.magenta(), "Total scrobbles to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_scrobbles).step_by(BATCH_SIZE) {
        let scrobbles =
            repo::scrobble::get_scrobbles(&pools.source, offset as i64, BATCH_SIZE as i64).await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + scrobbles.len() as i64).min(total_scrobbles)).magenta(),
            total = %total_scrobbles.magenta(),
            "Fetched scrobbles"
        );

        for scrobble in &scrobbles {
            tracing::info!(user_id = %scrobble.user_id.cyan(), track_id = %scrobble.track_id.magenta(), i = %i.magenta(), total = %total_scrobbles.magenta(), "Inserting scrobble");
            match repo::scrobble::insert_scrobble(&pools.destination, scrobble).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert scrobble");
                }
            }
            i += 1;
        }
    }
    Ok(())
}

async fn sync_album_tracks(pools: &DatabasePools) -> Result<(), Error> {
    let total_album_tracks: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM album_tracks")
        .fetch_one(&pools.source)
        .await?;
    let total_album_tracks = total_album_tracks.0;
    tracing::info!(total = %total_album_tracks.magenta(), "Total album tracks to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_album_tracks).step_by(BATCH_SIZE) {
        let album_tracks =
            repo::album::get_album_tracks(&pools.source, offset as i64, BATCH_SIZE as i64).await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + album_tracks.len() as i64).min(total_album_tracks)).magenta(),
            total = %total_album_tracks.magenta(),
            "Fetched album tracks"
        );

        for album_track in &album_tracks {
            tracing::info!(album_id = %album_track.album_id.cyan(), track_id = %album_track.track_id.magenta(), i = %i.magenta(), total = %total_album_tracks.magenta(), "Inserting album track");
            match repo::album::insert_album_track(&pools.destination, album_track).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert album track");
                }
            }
            i += 1;
        }
    }
    Ok(())
}

async fn sync_artist_albums(pools: &DatabasePools) -> Result<(), Error> {
    let total_artist_albums: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM artist_albums")
        .fetch_one(&pools.source)
        .await?;
    let total_artist_albums = total_artist_albums.0;
    tracing::info!(total = %total_artist_albums.magenta(), "Total artist albums to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_artist_albums).step_by(BATCH_SIZE) {
        let artist_albums =
            repo::artist::get_artist_albums(&pools.source, offset as i64, BATCH_SIZE as i64)
                .await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + artist_albums.len() as i64).min(total_artist_albums)).magenta(),
            total = %total_artist_albums.magenta(),
            "Fetched artist albums"
        );

        for artist_album in &artist_albums {
            tracing::info!(artist_id = %artist_album.artist_id.cyan(), album_id = %artist_album.album_id.magenta(), i = %i.magenta(), total = %total_artist_albums.magenta(), "Inserting artist album");
            match repo::artist::insert_artist_album(&pools.destination, artist_album).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert artist album");
                }
            }
            i += 1;
        }
    }
    Ok(())
}

async fn sync_artist_tracks(pools: &DatabasePools) -> Result<(), Error> {
    let total_artist_tracks: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM artist_tracks")
        .fetch_one(&pools.source)
        .await?;
    let total_artist_tracks = total_artist_tracks.0;
    tracing::info!(total = %total_artist_tracks.magenta(), "Total artist tracks to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_artist_tracks).step_by(BATCH_SIZE) {
        let artist_tracks =
            repo::artist::get_artist_tracks(&pools.source, offset as i64, BATCH_SIZE as i64)
                .await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + artist_tracks.len() as i64).min(total_artist_tracks)).magenta(),
            total = %total_artist_tracks.magenta(),
            "Fetched artist tracks"
        );

        for artist_track in &artist_tracks {
            tracing::info!(artist_id = %artist_track.artist_id.cyan(), track_id = %artist_track.track_id.magenta(), i = %i.magenta(), total = %total_artist_tracks.magenta(), "Inserting artist track");
            match repo::artist::insert_artist_track(&pools.destination, artist_track).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert artist track");
                }
            }
            i += 1;
        }
    }
    Ok(())
}

async fn sync_playlist_tracks(pools: &DatabasePools) -> Result<(), Error> {
    let total_playlist_tracks: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM playlist_tracks")
        .fetch_one(&pools.source)
        .await?;
    let total_playlist_tracks = total_playlist_tracks.0;
    tracing::info!(total = %total_playlist_tracks.magenta(), "Total playlist tracks to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_playlist_tracks).step_by(BATCH_SIZE) {
        let playlist_tracks =
            repo::playlist::get_playlist_tracks(&pools.source, offset as i64, BATCH_SIZE as i64)
                .await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + playlist_tracks.len() as i64).min(total_playlist_tracks)).magenta(),
            total = %total_playlist_tracks.magenta(),
            "Fetched playlist tracks"
        );

        for playlist_track in &playlist_tracks {
            tracing::info!(playlist_id = %playlist_track.playlist_id.cyan(), track_id = %playlist_track.track_id.magenta(), i = %i.magenta(), total = %total_playlist_tracks.magenta(), "Inserting playlist track");
            match repo::playlist::insert_playlist_track(&pools.destination, playlist_track).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert playlist track");
                }
            }
            i += 1;
        }
    }
    Ok(())
}

async fn sync_user_albums(pools: &DatabasePools) -> Result<(), Error> {
    let total_user_albums: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM user_albums")
        .fetch_one(&pools.source)
        .await?;
    let total_user_albums = total_user_albums.0;
    tracing::info!(total = %total_user_albums.magenta(), "Total user albums to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_user_albums).step_by(BATCH_SIZE) {
        let user_albums =
            repo::album::get_user_albums(&pools.source, offset as i64, BATCH_SIZE as i64).await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + user_albums.len() as i64).min(total_user_albums)).magenta(),
            total = %total_user_albums.magenta(),
            "Fetched user albums"
        );

        for user_album in &user_albums {
            tracing::info!(user_id = %user_album.user_id.cyan(), album_id = %user_album.album_id.magenta(), i = %i.magenta(), total = %total_user_albums.magenta(), "Inserting user album");
            match repo::album::insert_user_album(&pools.destination, user_album).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert user album");
                }
            }
            i += 1;
        }
    }
    Ok(())
}

async fn sync_user_artists(pools: &DatabasePools) -> Result<(), Error> {
    let total_user_artists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM user_artists")
        .fetch_one(&pools.source)
        .await?;
    let total_user_artists = total_user_artists.0;
    tracing::info!(total = %total_user_artists.magenta(), "Total user artists to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_user_artists).step_by(BATCH_SIZE) {
        let user_artists =
            repo::artist::get_user_artists(&pools.source, offset as i64, BATCH_SIZE as i64).await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + user_artists.len() as i64).min(total_user_artists)).magenta(),
            total = %total_user_artists.magenta(),
            "Fetched user artists"
        );

        for user_artist in &user_artists {
            tracing::info!(user_id = %user_artist.user_id.cyan(), artist_id = %user_artist.artist_id.magenta(), i = %i.magenta(), total = %total_user_artists.magenta(), "Inserting user artist");
            match repo::artist::insert_user_artist(&pools.destination, user_artist).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert user artist");
                }
            }
            i += 1;
        }
    }
    Ok(())
}

async fn sync_user_tracks(pools: &DatabasePools) -> Result<(), Error> {
    let total_user_tracks: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM user_tracks")
        .fetch_one(&pools.source)
        .await?;
    let total_user_tracks = total_user_tracks.0;
    tracing::info!(total = %total_user_tracks.magenta(), "Total user tracks to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_user_tracks).step_by(BATCH_SIZE) {
        let user_tracks =
            repo::track::get_user_tracks(&pools.source, offset as i64, BATCH_SIZE as i64).await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + user_tracks.len() as i64).min(total_user_tracks)).magenta(),
            total = %total_user_tracks.magenta(),
            "Fetched user tracks"
        );

        for user_track in &user_tracks {
            tracing::info!(user_id = %user_track.user_id.cyan(), track_id = %user_track.track_id.magenta(), i = %i.magenta(), total = %total_user_tracks.magenta(), "Inserting user track");
            match repo::track::insert_user_track(&pools.destination, user_track).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert user track");
                }
            }
            i += 1;
        }
    }
    Ok(())
}

async fn sync_user_playlists(pools: &DatabasePools) -> Result<(), Error> {
    let total_user_playlists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM user_playlists")
        .fetch_one(&pools.source)
        .await?;
    let total_user_playlists = total_user_playlists.0;
    tracing::info!(total = %total_user_playlists.magenta(), "Total user playlists to sync");

    let start = 0;
    let mut i = 1;

    for offset in (start..total_user_playlists).step_by(BATCH_SIZE) {
        let user_playlists =
            repo::playlist::get_user_playlists(&pools.source, offset as i64, BATCH_SIZE as i64)
                .await?;
        tracing::info!(
            offset = %offset.magenta(),
            end = %((offset + user_playlists.len() as i64).min(total_user_playlists)).magenta(),
            total = %total_user_playlists.magenta(),
            "Fetched user playlists"
        );

        for user_playlist in &user_playlists {
            tracing::info!(user_id = %user_playlist.user_id.cyan(), playlist_id = %user_playlist.playlist_id.magenta(), i = %i.magenta(), total = %total_user_playlists.magenta(), "Inserting user playlist");
            match repo::playlist::insert_user_playlist(&pools.destination, user_playlist).await {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "Failed to insert user playlist");
                }
            }
            i += 1;
        }
    }
    Ok(())
}
