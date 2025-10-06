use std::env;

mod repo;
mod xata;

use anyhow::{Context, Error};
use owo_colors::OwoColorize;
use sqlx::postgres::PgPoolOptions;

pub async fn pull_data() -> Result<(), Error> {
    if env::var("SOURCE_POSTGRES_URL").is_err() {
        tracing::error!(
            "SOURCE_POSTGRES_URL is not set. Please set it to your PostgreSQL connection string."
        );
        std::process::exit(1);
    }

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("SOURCE_POSTGRES_URL")?)
        .await?;

    let dest_pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let pool_clone = pool.clone();
    let dest_pool_clone = dest_pool.clone();
    let album_sync = tokio::spawn(async move {
        let total_albums: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM albums")
            .fetch_one(&pool_clone)
            .await?;
        let total_albums = total_albums.0;
        tracing::info!(total = %total_albums.magenta(), "Total albums to sync");

        const BATCH_SIZE: usize = 1000;

        let start = 0;
        let mut i = 1;

        for offset in (start..total_albums).step_by(BATCH_SIZE) {
            let albums =
                repo::album::get_albums(&pool_clone, offset as i64, BATCH_SIZE as i64).await?;
            tracing::info!(
                offset = %offset.magenta(),
                end = %((offset + albums.len() as i64).min(total_albums)).magenta(),
                total = %total_albums.magenta(),
                "Fetched albums"
            );
            for album in &albums {
                tracing::info!(title = %album.title.cyan(), i = %i.magenta(), total = %total_albums.magenta(), "Inserting album");
                repo::album::insert_album(&dest_pool_clone, album).await?;
                i += 1;
            }
        }
        Ok::<(), Error>(())
    });

    let pool_clone = pool.clone();
    let dest_pool_clone = dest_pool.clone();
    let artist_sync = tokio::spawn(async move {
        let total_artists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM artists")
            .fetch_one(&pool_clone)
            .await?;
        let total_artists = total_artists.0;
        tracing::info!(total = %total_artists.magenta(), "Total artists to sync");

        const BATCH_SIZE: usize = 1000;

        let start = 0;
        let mut i = 1;

        for offset in (start..total_artists).step_by(BATCH_SIZE) {
            let artists =
                repo::artist::get_artists(&pool_clone, offset as i64, BATCH_SIZE as i64).await?;
            tracing::info!(
                offset = %offset.magenta(),
                end = %((offset + artists.len() as i64).min(total_artists)).magenta(),
                total = %total_artists.magenta(),
                "Fetched artists"
            );
            for artist in &artists {
                tracing::info!(name = %artist.name.cyan(), i = %i.magenta(), total = %total_artists.magenta(), "Inserting artist");
                repo::artist::insert_artist(&dest_pool_clone, artist).await?;
                i += 1;
            }
        }
        Ok::<(), Error>(())
    });

    let pool_clone = pool.clone();
    let dest_pool_clone = dest_pool.clone();
    let track_sync = tokio::spawn(async move {
        let total_tracks: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM tracks")
            .fetch_one(&pool_clone)
            .await?;
        let total_tracks = total_tracks.0;
        tracing::info!(total = %total_tracks.magenta(), "Total tracks to sync");

        const BATCH_SIZE: usize = 1000;

        let start = 0;
        let mut i = 1;

        for offset in (start..total_tracks).step_by(BATCH_SIZE) {
            let tracks =
                repo::track::get_tracks(&pool_clone, offset as i64, BATCH_SIZE as i64).await?;
            tracing::info!(
                offset = %offset.magenta(),
                end = %((offset + tracks.len() as i64).min(total_tracks)).magenta(),
                total = %total_tracks.magenta(),
                "Fetched tracks"
            );

            for track in &tracks {
                tracing::info!(title = %track.title.cyan(), i = %i.magenta(), total = %total_tracks.magenta(), "Inserting track");
                match repo::track::insert_track(&dest_pool_clone, track).await {
                    Ok(_) => {}
                    Err(e) => {
                        tracing::error!(error = %e, "Failed to insert track");
                    }
                }
                i += 1;
            }
        }
        Ok::<(), Error>(())
    });

    let pool_clone = pool.clone();
    let dest_pool_clone = dest_pool.clone();
    let user_sync = tokio::spawn(async move {
        let total_users: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&pool_clone)
            .await?;
        let total_users = total_users.0;
        tracing::info!(total = %total_users.magenta(), "Total users to sync");

        const BATCH_SIZE: usize = 1000;

        let start = 0;
        let mut i = 1;

        for offset in (start..total_users).step_by(BATCH_SIZE) {
            let users =
                repo::user::get_users(&pool_clone, offset as i64, BATCH_SIZE as i64).await?;
            tracing::info!(
                offset = %offset.magenta(),
                end = %((offset + users.len() as i64).min(total_users)).magenta(),
                total = %total_users.magenta(),
                "Fetched users"
            );

            for user in &users {
                tracing::info!(handle = %user.handle.cyan(), i = %i.magenta(), total = %total_users.magenta(), "Inserting user");
                match repo::user::insert_user(&dest_pool_clone, user).await {
                    Ok(_) => {}
                    Err(e) => {
                        tracing::error!(error = %e, "Failed to insert user");
                    }
                }
                i += 1;
            }
        }
        Ok::<(), Error>(())
    });

    let (album_sync, artist_sync, track_sync, user_sync) =
        tokio::join!(album_sync, artist_sync, track_sync, user_sync);

    album_sync.context("Album sync task failed")??;
    artist_sync.context("Artist sync task failed")??;
    track_sync.context("Track sync task failed")??;
    user_sync.context("User sync task failed")??;

    let pool_clone = pool.clone();
    let dest_pool_clone = dest_pool.clone();
    let playlist_sync = tokio::spawn(async move {
        let total_playlists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM playlists")
            .fetch_one(&pool_clone)
            .await?;
        let total_playlists = total_playlists.0;
        tracing::info!(total = %total_playlists.magenta(), "Total playlists to sync");

        const BATCH_SIZE: usize = 1000;

        let start = 0;
        let mut i = 1;

        for offset in (start..total_playlists).step_by(BATCH_SIZE) {
            let playlists =
                repo::playlist::get_playlists(&pool_clone, offset as i64, BATCH_SIZE as i64)
                    .await?;
            tracing::info!(
                offset = %offset.magenta(),
                end = %((offset + playlists.len() as i64).min(total_playlists)).magenta(),
                total = %total_playlists.magenta(),
                "Fetched playlists"
            );

            for playlist in &playlists {
                tracing::info!(name = %playlist.name.cyan(), i = %i.magenta(), total = %total_playlists.magenta(), "Inserting playlist");
                match repo::playlist::insert_playlist(&dest_pool_clone, playlist).await {
                    Ok(_) => {}
                    Err(e) => {
                        tracing::error!(error = %e, "Failed to insert playlist");
                    }
                }
                i += 1;
            }
        }
        Ok::<(), Error>(())
    });

    let pool_clone = pool.clone();
    let dest_pool_clone = dest_pool.clone();
    let loved_track_sync = tokio::spawn(async move {
        let total_loved_tracks: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM loved_tracks")
            .fetch_one(&pool_clone)
            .await?;
        let total_loved_tracks = total_loved_tracks.0;
        tracing::info!(total = %total_loved_tracks.magenta(), "Total loved tracks to sync");

        const BATCH_SIZE: usize = 1000;

        let start = 0;
        let mut i = 1;

        for offset in (start..total_loved_tracks).step_by(BATCH_SIZE) {
            let loved_tracks =
                repo::loved_track::get_loved_tracks(&pool_clone, offset as i64, BATCH_SIZE as i64)
                    .await?;
            tracing::info!(
                offset = %offset.magenta(),
                end = %((offset + loved_tracks.len() as i64).min(total_loved_tracks)).magenta(),
                total = %total_loved_tracks.magenta(),
                "Fetched loved tracks"
            );

            for loved_track in &loved_tracks {
                tracing::info!(user_id = %loved_track.user_id.cyan(), track_id = %loved_track.track_id.magenta(), i = %i.magenta(), total = %total_loved_tracks.magenta(), "Inserting loved track");
                match repo::loved_track::insert_loved_track(&dest_pool_clone, loved_track).await {
                    Ok(_) => {}
                    Err(e) => {
                        tracing::error!(error = %e, "Failed to insert loved track");
                    }
                }
                i += 1;
            }
        }
        Ok::<(), Error>(())
    });

    let pool_clone = pool.clone();
    let dest_pool_clone = dest_pool.clone();

    let scrobble_sync = tokio::spawn(async move {
        let total_scrobbles: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM scrobbles")
            .fetch_one(&pool_clone)
            .await?;
        let total_scrobbles = total_scrobbles.0;
        tracing::info!(total = %total_scrobbles.magenta(), "Total scrobbles to sync");

        const BATCH_SIZE: usize = 1000;

        let start = 0;
        let mut i = 1;

        for offset in (start..total_scrobbles).step_by(BATCH_SIZE) {
            let scrobbles =
                repo::scrobble::get_scrobbles(&pool_clone, offset as i64, BATCH_SIZE as i64)
                    .await?;
            tracing::info!(
                offset = %offset.magenta(),
                end = %((offset + scrobbles.len() as i64).min(total_scrobbles)).magenta(),
                total = %total_scrobbles.magenta(),
                "Fetched scrobbles"
            );

            for scrobble in &scrobbles {
                tracing::info!(user_id = %scrobble.user_id.cyan(), track_id = %scrobble.track_id.magenta(), i = %i.magenta(), total = %total_scrobbles.magenta(), "Inserting scrobble");
                match repo::scrobble::insert_scrobble(&dest_pool_clone, scrobble).await {
                    Ok(_) => {}
                    Err(e) => {
                        tracing::error!(error = %e, "Failed to insert scrobble");
                    }
                }
                i += 1;
            }
        }
        Ok::<(), Error>(())
    });

    let (loved_track_sync, playlist_sync, scrobble_sync) =
        tokio::join!(loved_track_sync, playlist_sync, scrobble_sync);
    loved_track_sync.context("Loved track sync task failed")??;
    playlist_sync.context("Playlist sync task failed")??;
    scrobble_sync.context("Scrobble sync task failed")??;

    Ok(())
}
