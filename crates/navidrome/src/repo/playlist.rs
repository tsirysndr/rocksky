use anyhow::Error;
use chrono::{DateTime, Utc};
use sqlx::{Pool, Postgres};

use crate::repo::track::TRACK_SELECT;
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

// Navidrome playlists live in their own dedicated tables so they stay isolated
// from playlists ingested from other sources (atproto, Spotify, …).

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
            NULL::text AS picture,
            p.user_id AS created_by,
            p.xata_createdat,
            (SELECT COUNT(*) FROM navidrome_playlist_tracks pt
             WHERE pt.playlist_id = p.xata_id) AS track_count
        FROM navidrome_playlists p
        WHERE p.user_id = $1
        ORDER BY p.xata_createdat DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Create an empty playlist owned by `user_id`; returns the new playlist id.
pub async fn create_playlist(
    pool: &Pool<Postgres>,
    user_id: &str,
    name: &str,
    description: Option<&str>,
) -> Result<String, Error> {
    let playlist_id: String = sqlx::query_scalar(
        r#"
        INSERT INTO navidrome_playlists (name, description, user_id)
        VALUES ($1, $2, $3)
        RETURNING xata_id
        "#,
    )
    .bind(name)
    .bind(description)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(playlist_id)
}

/// True when `user_id` owns the playlist (i.e. may mutate/delete it).
pub async fn is_owner(
    pool: &Pool<Postgres>,
    playlist_id: &str,
    user_id: &str,
) -> Result<bool, Error> {
    let owner: Option<String> = sqlx::query_scalar(
        r#"SELECT xata_id FROM navidrome_playlists WHERE xata_id = $1 AND user_id = $2"#,
    )
    .bind(playlist_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(owner.is_some())
}

pub async fn update_meta(
    pool: &Pool<Postgres>,
    playlist_id: &str,
    name: Option<&str>,
    comment: Option<&str>,
) -> Result<(), Error> {
    if let Some(n) = name {
        sqlx::query(
            r#"UPDATE navidrome_playlists SET name = $1, xata_updatedat = now() WHERE xata_id = $2"#,
        )
        .bind(n)
        .bind(playlist_id)
        .execute(pool)
        .await?;
    }
    if let Some(c) = comment {
        sqlx::query(
            r#"UPDATE navidrome_playlists SET description = $1, xata_updatedat = now() WHERE xata_id = $2"#,
        )
        .bind(c)
        .bind(playlist_id)
        .execute(pool)
        .await?;
    }
    Ok(())
}

/// Append a track (by its xata_id / Subsonic song id) to the playlist.
pub async fn add_track(
    pool: &Pool<Postgres>,
    playlist_id: &str,
    track_id: &str,
) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO navidrome_playlist_tracks (playlist_id, track_id) VALUES ($1, $2)"#,
    )
    .bind(playlist_id)
    .bind(track_id)
    .execute(pool)
    .await?;
    sqlx::query(r#"UPDATE navidrome_playlists SET xata_updatedat = now() WHERE xata_id = $1"#)
        .bind(playlist_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Remove the track at the given 0-based position (ordered as displayed).
pub async fn remove_track_at(
    pool: &Pool<Postgres>,
    playlist_id: &str,
    index: i64,
) -> Result<(), Error> {
    let entry_id: Option<String> = sqlx::query_scalar(
        r#"
        SELECT xata_id FROM navidrome_playlist_tracks
        WHERE playlist_id = $1
        ORDER BY xata_createdat ASC
        OFFSET $2 LIMIT 1
        "#,
    )
    .bind(playlist_id)
    .bind(index)
    .fetch_optional(pool)
    .await?;

    if let Some(id) = entry_id {
        sqlx::query(r#"DELETE FROM navidrome_playlist_tracks WHERE xata_id = $1"#)
            .bind(id)
            .execute(pool)
            .await?;
        sqlx::query(r#"UPDATE navidrome_playlists SET xata_updatedat = now() WHERE xata_id = $1"#)
            .bind(playlist_id)
            .execute(pool)
            .await?;
    }
    Ok(())
}

pub async fn delete_playlist(pool: &Pool<Postgres>, playlist_id: &str) -> Result<(), Error> {
    sqlx::query(r#"DELETE FROM navidrome_playlist_tracks WHERE playlist_id = $1"#)
        .bind(playlist_id)
        .execute(pool)
        .await?;
    sqlx::query(r#"DELETE FROM navidrome_playlists WHERE xata_id = $1"#)
        .bind(playlist_id)
        .execute(pool)
        .await?;
    Ok(())
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
            NULL::text AS picture,
            p.user_id AS created_by,
            p.xata_createdat,
            (SELECT COUNT(*) FROM navidrome_playlist_tracks pt
             WHERE pt.playlist_id = p.xata_id) AS track_count
        FROM navidrome_playlists p
        WHERE p.xata_id = $1 AND p.user_id = $2
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

    // Reuse the canonical track projection (includes BYO-storage columns) so the
    // row deserializes into TrackWithUpload correctly.
    let tracks_sql = format!(
        r#"
        {TRACK_SELECT}
        JOIN navidrome_playlist_tracks npt ON npt.track_id = tracks.xata_id
        WHERE npt.playlist_id = $1 AND user_uploads.user_id = $2
        ORDER BY npt.xata_createdat ASC
        "#,
    );

    let tracks: Vec<TrackWithUpload> = sqlx::query_as(&tracks_sql)
        .bind(playlist_id)
        .bind(user_id)
        .fetch_all(pool)
        .await?;

    Ok(Some((playlist, tracks)))
}
