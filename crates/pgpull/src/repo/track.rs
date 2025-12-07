use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::{track::Track, user_track::UserTrack};

pub async fn get_tracks(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<Track>, Error> {
    let tracks: Vec<Track> = sqlx::query_as("SELECT * FROM tracks OFFSET $1 LIMIT $2")
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await?;
    Ok(tracks)
}

pub async fn get_user_tracks(
    pool: &Pool<Postgres>,
    offset: i64,
    limit: i64,
) -> Result<Vec<UserTrack>, Error> {
    let user_tracks: Vec<UserTrack> =
        sqlx::query_as("SELECT * FROM user_tracks OFFSET $1 LIMIT $2")
            .bind(offset)
            .bind(limit)
            .fetch_all(pool)
            .await?;
    Ok(user_tracks)
}

pub async fn insert_track(pool: &Pool<Postgres>, track: &Track) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO tracks (
            xata_id,
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
            xata_createdat
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
          ON CONFLICT (xata_id, sha256) DO NOTHING
         "#,
    )
    .bind(&track.xata_id)
    .bind(&track.title)
    .bind(&track.artist)
    .bind(&track.album_artist)
    .bind(&track.album_art)
    .bind(&track.album)
    .bind(track.track_number)
    .bind(track.duration)
    .bind(&track.mb_id)
    .bind(&track.youtube_link)
    .bind(&track.spotify_link)
    .bind(&track.tidal_link)
    .bind(&track.apple_music_link)
    .bind(&track.sha256)
    .bind(&track.lyrics)
    .bind(&track.composer)
    .bind(&track.genre)
    .bind(track.disc_number)
    .bind(&track.copyright_message)
    .bind(&track.label)
    .bind(&track.uri)
    .bind(&track.artist_uri)
    .bind(&track.album_uri)
    .bind(track.xata_createdat)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn insert_user_track(pool: &Pool<Postgres>, user_track: &UserTrack) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO user_tracks (
            xata_id,
            user_id,
            track_id,
            uri,
            xata_createdat
        ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (xata_id) DO NOTHING
         "#,
    )
    .bind(&user_track.xata_id)
    .bind(&user_track.user_id)
    .bind(&user_track.track_id)
    .bind(&user_track.uri)
    .bind(user_track.xata_createdat)
    .execute(pool)
    .await?;
    Ok(())
}
