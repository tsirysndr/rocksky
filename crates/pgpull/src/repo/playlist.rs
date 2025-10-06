use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::{playlist::Playlist, playlist_track::PlaylistTrack, user_playlist::UserPlaylist};

pub async fn get_playlists(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<Playlist>, Error> {
    let playlists: Vec<Playlist> = sqlx::query_as("SELECT * FROM playlists OFFSET $1 LIMIT $2")
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await?;
    Ok(playlists)
}

pub async fn get_playlist_tracks(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<PlaylistTrack>, Error> {
    let playlist_tracks: Vec<PlaylistTrack> =
        sqlx::query_as("SELECT * FROM playlist_tracks OFFSET $1 LIMIT $2")
            .bind(offset)
            .bind(limit)
            .fetch_all(pool)
            .await?;
    Ok(playlist_tracks)
}

pub async fn get_user_playlists(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<UserPlaylist>, Error> {
    let user_playlists: Vec<UserPlaylist> =
        sqlx::query_as("SELECT * FROM user_playlists OFFSET $1 LIMIT $2")
            .bind(offset)
            .bind(limit)
            .fetch_all(pool)
            .await?;
    Ok(user_playlists)
}

pub async fn insert_playlist(pool: &Pool<Postgres>, playlist: &Playlist) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO playlists (
        xata_id,
        name,
        description,
        picture,
        spotify_link,
        tidal_link,
        apple_music_link,
        xata_createdat,
        xata_updatedat,
        uri,
        created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&playlist.xata_id)
    .bind(&playlist.name)
    .bind(&playlist.description)
    .bind(&playlist.picture)
    .bind(&playlist.spotify_link)
    .bind(&playlist.tidal_link)
    .bind(&playlist.apple_music_link)
    .bind(playlist.xata_createdat)
    .bind(playlist.xata_updatedat)
    .bind(&playlist.uri)
    .bind(&playlist.created_by)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn insert_playlist_track(
    pool: &Pool<Postgres>,
    playlist_track: &PlaylistTrack,
) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO playlist_tracks (
        xata_id,
        playlist_id,
        track_id,
        added_by,
        xata_createdat
    ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&playlist_track.xata_id)
    .bind(&playlist_track.playlist_id)
    .bind(&playlist_track.track_id)
    .bind(&playlist_track.added_by)
    .bind(playlist_track.xata_createdat)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn insert_user_playlist(
    pool: &Pool<Postgres>,
    user_playlist: &UserPlaylist,
) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO user_playlists (
        xata_id,
        user_id,
        playlist_id,
        uri,
        xata_createdat
    ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&user_playlist.xata_id)
    .bind(&user_playlist.user_id)
    .bind(&user_playlist.playlist_id)
    .bind(&user_playlist.uri)
    .bind(user_playlist.xata_createdat)
    .execute(pool)
    .await?;
    Ok(())
}
