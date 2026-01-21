use std::sync::{Arc, Mutex};

use crate::types::track::{GetLovedTracksParams, GetTopTracksParams, GetTracksParams, Track};
use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;
use duckdb::Connection;
use tokio_stream::StreamExt;

use crate::read_payload;

pub async fn get_tracks(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetTracksParams>(&body)?;
    let pagination = params.pagination.unwrap_or_default();
    let offset = pagination.skip.unwrap_or(0);
    let limit = pagination.take.unwrap_or(20);
    let did = params.user_did;
    let genre = params.genre;
    tracing::info!(limit, offset, user_did = ?did, genre = ?genre, "Get tracks");

    let conn = conn.lock().unwrap();
    match did {
        Some(did) => {
            let genre_filter = if genre.is_some() {
                " AND list_contains(a.genres, ?)"
            } else {
                ""
            };
            let query = format!(
                r#"
                SELECT
                    t.id,
                    t.title,
                    t.artist,
                    t.album_artist,
                    t.album_art,
                    t.album,
                    t.track_number,
                    t.duration,
                    t.mb_id,
                    t.youtube_link,
                    t.spotify_link,
                    t.tidal_link,
                    t.apple_music_link,
                    t.sha256,
                    t.composer,
                    t.genre,
                    t.disc_number,
                    t.label,
                    t.uri,
                    t.copyright_message,
                    t.artist_uri,
                    t.album_uri,
                    t.created_at,
                    COUNT(*) AS play_count,
                    COUNT(DISTINCT s.user_id) AS unique_listeners
                FROM tracks t
                LEFT JOIN user_tracks ut ON t.id = ut.track_id
                LEFT JOIN users u ON ut.user_id = u.id
                LEFT JOIN scrobbles s ON s.track_id = t.id
                LEFT JOIN artists a ON t.artist_uri = a.uri
                WHERE (u.did = ? OR u.handle = ?){}
                GROUP BY t.id, t.title, t.artist, t.album_artist, t.album_art, t.album, t.track_number, t.duration, t.mb_id, t.youtube_link, t.spotify_link, t.tidal_link, t.apple_music_link, t.sha256, t.composer, t.genre, t.disc_number, t.label, t.copyright_message, t.uri, t.created_at, t.artist_uri, t.album_uri
                ORDER BY play_count DESC
                LIMIT ?
                OFFSET ?;
                "#,
                genre_filter
            );

            let mut stmt = conn.prepare(&query)?;
            let params: Vec<&dyn duckdb::ToSql> = if let Some(g) = &genre {
                vec![&did, &did, g, &limit, &offset]
            } else {
                vec![&did, &did, &limit, &offset]
            };

            let tracks = stmt.query_map(duckdb::params_from_iter(params), |row| {
                Ok(Track {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    album_artist: row.get(3)?,
                    album_art: row.get(4)?,
                    album: row.get(5)?,
                    track_number: row.get(6)?,
                    duration: row.get(7)?,
                    mb_id: row.get(8)?,
                    youtube_link: row.get(9)?,
                    spotify_link: row.get(10)?,
                    tidal_link: row.get(11)?,
                    apple_music_link: row.get(12)?,
                    sha256: row.get(13)?,
                    composer: row.get(14)?,
                    genre: row.get(15)?,
                    disc_number: row.get(16)?,
                    label: row.get(17)?,
                    uri: row.get(18)?,
                    copyright_message: row.get(19)?,
                    artist_uri: row.get(20)?,
                    album_uri: row.get(21)?,
                    created_at: row.get(22)?,
                    play_count: row.get(23)?,
                    unique_listeners: row.get(24)?,
                    ..Default::default()
                })
            })?;
            let tracks: Result<Vec<_>, _> = tracks.collect();
            Ok(HttpResponse::Ok().json(tracks?))
        }
        None => {
            let genre_filter = if genre.is_some() {
                " WHERE list_contains(a.genres, ?)"
            } else {
                ""
            };
            let query = format!(
                r#"
                SELECT
                    t.id,
                    t.title,
                    t.artist,
                    t.album_artist,
                    t.album_art,
                    t.album,
                    t.track_number,
                    t.duration,
                    t.mb_id,
                    t.youtube_link,
                    t.spotify_link,
                    t.tidal_link,
                    t.apple_music_link,
                    t.sha256,
                    t.composer,
                    t.genre,
                    t.disc_number,
                    t.label,
                    t.uri,
                    t.copyright_message,
                    t.artist_uri,
                    t.album_uri,
                    t.created_at,
                    COUNT(*) AS play_count,
                    COUNT(DISTINCT s.user_id) AS unique_listeners
                FROM tracks t
                LEFT JOIN scrobbles s ON s.track_id = t.id
                LEFT JOIN artists a ON t.artist_uri = a.uri{}
                GROUP BY t.id, t.title, t.artist, t.album_artist, t.album_art, t.album, t.track_number, t.duration, t.mb_id, t.youtube_link, t.spotify_link, t.tidal_link, t.apple_music_link, t.sha256, t.composer, t.genre, t.disc_number, t.label, t.copyright_message, t.uri, t.created_at, t.artist_uri, t.album_uri
                ORDER BY play_count DESC
                LIMIT ?
                OFFSET ?;
                "#,
                genre_filter
            );

            let mut stmt = conn.prepare(&query)?;
            let params: Vec<&dyn duckdb::ToSql> = if let Some(g) = &genre {
                vec![g, &limit, &offset]
            } else {
                vec![&limit, &offset]
            };

            let tracks = stmt.query_map(duckdb::params_from_iter(params), |row| {
                Ok(Track {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    album_artist: row.get(3)?,
                    album_art: row.get(4)?,
                    album: row.get(5)?,
                    track_number: row.get(6)?,
                    duration: row.get(7)?,
                    mb_id: row.get(8)?,
                    youtube_link: row.get(9)?,
                    spotify_link: row.get(10)?,
                    tidal_link: row.get(11)?,
                    apple_music_link: row.get(12)?,
                    sha256: row.get(13)?,
                    composer: row.get(14)?,
                    genre: row.get(15)?,
                    disc_number: row.get(16)?,
                    label: row.get(17)?,
                    uri: row.get(18)?,
                    copyright_message: row.get(19)?,
                    artist_uri: row.get(20)?,
                    album_uri: row.get(21)?,
                    created_at: row.get(22)?,
                    play_count: row.get(23)?,
                    unique_listeners: row.get(24)?,
                    ..Default::default()
                })
            })?;
            let tracks: Result<Vec<_>, _> = tracks.collect();
            Ok(HttpResponse::Ok().json(tracks?))
        }
    }
}

pub async fn get_loved_tracks(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetLovedTracksParams>(&body)?;
    let pagination = params.pagination.unwrap_or_default();
    let offset = pagination.skip.unwrap_or(0);
    let limit = pagination.take.unwrap_or(20);
    let did = params.user_did;
    tracing::info!(limit, offset, user_did = ?did, "Get loved tracks");

    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        r#"
        SELECT
            t.id,
            t.title,
            t.artist,
            t.album,
            t.album_artist,
            t.album_art,
            t.album_uri,
            t.artist_uri,
            t.composer,
            t.copyright_message,
            t.disc_number,
            t.duration,
            t.track_number,
            t.label,
            t.spotify_link,
            t.tidal_link,
            t.youtube_link,
            t.apple_music_link,
            t.sha256,
            t.uri,
            u.handle,
            u.did,
            l.created_at
        FROM loved_tracks l
        LEFT JOIN users u ON l.user_id = u.id
        LEFT JOIN tracks t ON l.track_id = t.id
        WHERE u.did = ? OR u.handle = ?
        ORDER BY l.created_at DESC
        OFFSET ?
        LIMIT ?;
    "#,
    )?;
    let loved_tracks = stmt.query_map(
        [&did, &did, &limit.to_string(), &offset.to_string()],
        |row| {
            Ok(Track {
                id: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                album: row.get(3)?,
                album_artist: row.get(4)?,
                album_art: row.get(5)?,
                album_uri: row.get(6)?,
                artist_uri: row.get(7)?,
                composer: row.get(8)?,
                copyright_message: row.get(9)?,
                disc_number: row.get(10)?,
                duration: row.get(11)?,
                track_number: row.get(12)?,
                label: row.get(13)?,
                spotify_link: row.get(14)?,
                tidal_link: row.get(15)?,
                youtube_link: row.get(16)?,
                apple_music_link: row.get(17)?,
                sha256: row.get(18)?,
                uri: row.get(19)?,
                handle: row.get(20)?,
                did: row.get(21)?,
                created_at: row.get(22)?,
                ..Default::default()
            })
        },
    )?;
    let loved_tracks: Result<Vec<_>, _> = loved_tracks.collect();
    Ok(HttpResponse::Ok().json(loved_tracks?))
}

pub async fn get_top_tracks(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetTopTracksParams>(&body)?;

    let pagination = params.pagination.clone().unwrap_or_default();
    let offset: i64 = pagination.skip.unwrap_or(0) as i64;
    let limit: i64 = pagination.take.unwrap_or(20) as i64;

    let did = params.user_did.clone();

    let start_date: Option<&str> = params.start_date.as_deref();
    let end_date: Option<&str> = params.end_date.as_deref();

    tracing::info!(
        limit,
        offset,
        user_did = ?did,
        start_date = ?params.start_date,
        end_date = ?params.end_date,
        "Get top tracks"
    );

    let conn = conn.lock().unwrap();

    match did {
        Some(did) => {
            let mut stmt = conn.prepare(
                r#"
                SELECT
                    t.id,
                    t.title,
                    t.artist,
                    t.album_artist,
                    t.album,
                    t.uri,
                    t.album_art,
                    t.duration,
                    t.disc_number,
                    t.track_number,
                    t.artist_uri,
                    t.album_uri,
                    t.sha256,
                    t.created_at,
                    COUNT(DISTINCT s.created_at) AS play_count,
                    COUNT(DISTINCT s.user_id) AS unique_listeners
                FROM scrobbles s
                LEFT JOIN tracks t ON s.track_id = t.id
                LEFT JOIN artists ar ON s.artist_id = ar.id
                LEFT JOIN albums a ON s.album_id = a.id
                LEFT JOIN users u ON s.user_id = u.id
                WHERE
                    (u.did = ? OR u.handle = ?)
                    AND (? IS NULL OR s.created_at >= CAST(? AS TIMESTAMP))
                    AND (? IS NULL OR s.created_at <= CAST(? AS TIMESTAMP))
                GROUP BY
                    t.id, s.track_id, t.title, ar.name, a.title, t.artist, t.uri,
                    t.album_art, t.duration, t.disc_number, t.track_number,
                    t.artist_uri, t.album_uri, t.created_at, t.sha256,
                    t.album_artist, t.album
                ORDER BY play_count DESC
                LIMIT ?
                OFFSET ?;
                "#,
            )?;

            let rows = stmt.query_map(
                duckdb::params![
                    did,        // u.did = ?
                    did,        // u.handle = ?
                    start_date, // ? IS NULL
                    start_date, // CAST(? AS TIMESTAMP)
                    end_date,   // ? IS NULL
                    end_date,   // CAST(? AS TIMESTAMP)
                    limit,      // LIMIT ?
                    offset      // OFFSET ?
                ],
                |row| {
                    Ok(Track {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        artist: row.get(2)?,
                        album_artist: row.get(3)?,
                        album: row.get(4)?,
                        uri: row.get(5)?,
                        album_art: row.get(6)?,
                        duration: row.get(7)?,
                        disc_number: row.get(8)?,
                        track_number: row.get(9)?,
                        artist_uri: row.get(10)?,
                        album_uri: row.get(11)?,
                        sha256: row.get(12)?,
                        created_at: row.get(13)?,
                        play_count: row.get(14)?,
                        unique_listeners: row.get(15)?,
                        ..Default::default()
                    })
                },
            )?;

            let top_tracks: Result<Vec<_>, _> = rows.collect();
            Ok(HttpResponse::Ok().json(top_tracks?))
        }

        None => {
            let mut stmt = conn.prepare(
                r#"
                SELECT
                    t.id,
                    t.title,
                    t.artist,
                    t.album_artist,
                    t.album,
                    t.uri,
                    t.album_art,
                    t.duration,
                    t.disc_number,
                    t.track_number,
                    t.artist_uri,
                    t.album_uri,
                    t.sha256,
                    t.created_at,
                    COUNT(*) AS play_count,
                    COUNT(DISTINCT s.user_id) AS unique_listeners
                FROM scrobbles s
                LEFT JOIN tracks t ON s.track_id = t.id
                LEFT JOIN artists ar ON s.artist_id = ar.id
                LEFT JOIN albums a ON s.album_id = a.id
                WHERE
                    s.track_id IS NOT NULL
                    AND s.artist_id IS NOT NULL
                    AND s.album_id IS NOT NULL
                    AND (? IS NULL OR s.created_at >= CAST(? AS TIMESTAMP))
                    AND (? IS NULL OR s.created_at <= CAST(? AS TIMESTAMP))
                GROUP BY
                    t.id, s.track_id, t.title, ar.name, a.title, t.artist, t.uri,
                    t.album_art, t.duration, t.disc_number, t.track_number,
                    t.artist_uri, t.album_uri, t.created_at, t.sha256,
                    t.album_artist, t.album
                ORDER BY play_count DESC
                LIMIT ?
                OFFSET ?;
                "#,
            )?;

            let rows = stmt.query_map(
                duckdb::params![start_date, start_date, end_date, end_date, limit, offset],
                |row| {
                    Ok(Track {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        artist: row.get(2)?,
                        album_artist: row.get(3)?,
                        album: row.get(4)?,
                        uri: row.get(5)?,
                        album_art: row.get(6)?,
                        duration: row.get(7)?,
                        disc_number: row.get(8)?,
                        track_number: row.get(9)?,
                        artist_uri: row.get(10)?,
                        album_uri: row.get(11)?,
                        sha256: row.get(12)?,
                        created_at: row.get(13)?,
                        play_count: row.get(14)?,
                        unique_listeners: row.get(15)?,
                        ..Default::default()
                    })
                },
            )?;

            let top_tracks: Result<Vec<_>, _> = rows.collect();
            Ok(HttpResponse::Ok().json(top_tracks?))
        }
    }
}
