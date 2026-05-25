use anyhow::Error;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};

use crate::xata::track::TrackWithUpload;

#[derive(sqlx::FromRow)]
pub struct PlaylistRow {
    pub xata_id: String,
    pub name: String,
    pub description: Option<String>,
    pub picture: Option<String>,
    pub created_by: String,
    pub xata_createdat: DateTime<Utc>,
    pub track_count: i64,
}

pub async fn get_playlists(
    pool: &Pool<Postgres>,
    user_id: &str,
) -> Result<Vec<PlaylistRow>, Error> {
    let rows: Vec<PlaylistRow> = sqlx::query_as(
        r#"
        SELECT
            p.xata_id,
            p.name,
            p.description,
            p.picture,
            p.created_by,
            p.xata_createdat,
            COUNT(pt.xata_id) AS track_count
        FROM playlists p
        JOIN user_playlists up ON p.xata_id = up.playlist_id
        LEFT JOIN playlist_tracks pt ON p.xata_id = pt.playlist_id
        WHERE up.user_id = $1
        GROUP BY p.xata_id, p.name, p.description, p.picture, p.created_by, p.xata_createdat
        ORDER BY p.xata_createdat DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_playlist(
    pool: &Pool<Postgres>,
    playlist_id: &str,
    user_id: &str,
) -> Result<Option<(PlaylistRow, Vec<TrackWithUpload>)>, Error> {
    let playlist: Option<PlaylistRow> = sqlx::query_as(
        r#"
        SELECT
            p.xata_id,
            p.name,
            p.description,
            p.picture,
            p.created_by,
            p.xata_createdat,
            COUNT(pt.xata_id) AS track_count
        FROM playlists p
        JOIN user_playlists up ON p.xata_id = up.playlist_id
        LEFT JOIN playlist_tracks pt ON p.xata_id = pt.playlist_id
        WHERE p.xata_id = $1 AND up.user_id = $2
        GROUP BY p.xata_id, p.name, p.description, p.picture, p.created_by, p.xata_createdat
        "#,
    )
    .bind(playlist_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let playlist = match playlist {
        Some(p) => p,
        None => return Ok(None),
    };

    let tracks: Vec<TrackWithUpload> = sqlx::query_as(
        r#"
        SELECT
            tracks.xata_id,
            tracks.title,
            tracks.artist,
            tracks.album_artist,
            tracks.album_art,
            tracks.album,
            tracks.track_number,
            tracks.disc_number,
            tracks.duration,
            tracks.mb_id,
            tracks.genre,
            tracks.xata_createdat,
            user_uploads.r2_key,
            user_uploads.mime_type,
            user_uploads.file_size,
            (SELECT at2.album_id FROM album_tracks at2 WHERE at2.track_id = tracks.xata_id LIMIT 1) AS album_id,
            (SELECT at3.artist_id FROM artist_tracks at3 WHERE at3.track_id = tracks.xata_id LIMIT 1) AS artist_id
        FROM playlist_tracks
        JOIN tracks ON playlist_tracks.track_id = tracks.xata_id
        JOIN user_uploads ON tracks.xata_id = user_uploads.track_id
        WHERE playlist_tracks.playlist_id = $1
          AND user_uploads.user_id = $2
        ORDER BY playlist_tracks.xata_createdat ASC
        "#,
    )
    .bind(playlist_id)
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(Some((playlist, tracks)))
}
