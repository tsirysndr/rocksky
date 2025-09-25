use std::sync::{Arc, Mutex};

use crate::types::{
    album::{Album, GetAlbumTracksParams, GetAlbumsParams, GetTopAlbumsParams},
    track::Track,
};
use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;
use duckdb::Connection;
use tokio_stream::StreamExt;

use crate::read_payload;

pub async fn get_albums(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetAlbumsParams>(&body)?;
    let pagination = params.pagination.unwrap_or_default();
    let offset = pagination.skip.unwrap_or(0);
    let limit = pagination.take.unwrap_or(20);
    let did = params.user_did;
    tracing::info!(limit, offset, user_did = ?did, "Get albums");

    let conn = conn.lock().unwrap();
    let mut stmt = match did {
        Some(_) => conn.prepare(
            r#"
        SELECT a.*,
          COUNT(*) AS play_count,
          COUNT(DISTINCT s.user_id) AS unique_listeners
         FROM user_albums ua
        LEFT JOIN albums a ON ua.album_id = a.id
        LEFT JOIN users u ON ua.user_id = u.id
        LEFT JOIN scrobbles s ON s.album_id = a.id
        WHERE u.did = ? OR u.handle = ?
        GROUP BY a.*
        ORDER BY play_count DESC OFFSET ? LIMIT ?;
      "#,
        )?,
        None => conn.prepare(
            "SELECT a.*,
        COUNT(*) AS play_count,
        COUNT(DISTINCT s.user_id) AS unique_listeners
       FROM albums a
       LEFT JOIN scrobbles s ON s.album_id = a.id
       GROUP BY a.*
       ORDER BY play_count DESC OFFSET ? LIMIT ?",
        )?,
    };

    match did {
        Some(did) => {
            let albums_iter = stmt.query_map(
                [&did, &did, &limit.to_string(), &offset.to_string()],
                |row| {
                    Ok(Album {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        artist: row.get(2)?,
                        release_date: row.get(3)?,
                        album_art: row.get(4)?,
                        year: row.get(5)?,
                        spotify_link: row.get(6)?,
                        tidal_link: row.get(7)?,
                        youtube_link: row.get(8)?,
                        apple_music_link: row.get(9)?,
                        sha256: row.get(10)?,
                        uri: row.get(11)?,
                        artist_uri: row.get(12)?,
                        play_count: Some(row.get(13)?),
                        unique_listeners: Some(row.get(14)?),
                        ..Default::default()
                    })
                },
            )?;

            let albums: Result<Vec<_>, _> = albums_iter.collect();
            Ok(HttpResponse::Ok().json(web::Json(albums?)))
        }
        None => {
            let albums_iter = stmt.query_map([limit, offset], |row| {
                Ok(Album {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    release_date: row.get(3)?,
                    album_art: row.get(4)?,
                    year: row.get(5)?,
                    spotify_link: row.get(6)?,
                    tidal_link: row.get(7)?,
                    youtube_link: row.get(8)?,
                    apple_music_link: row.get(9)?,
                    sha256: row.get(10)?,
                    uri: row.get(11)?,
                    artist_uri: row.get(12)?,
                    play_count: Some(row.get(13)?),
                    unique_listeners: Some(row.get(14)?),
                    ..Default::default()
                })
            })?;

            let albums: Result<Vec<_>, _> = albums_iter.collect();
            Ok(HttpResponse::Ok().json(web::Json(albums?)))
        }
    }
}

pub async fn get_top_albums(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetTopAlbumsParams>(&body)?;
    let pagination = params.pagination.unwrap_or_default();
    let offset = pagination.skip.unwrap_or(0);
    let limit = pagination.take.unwrap_or(20);
    let did = params.user_did;
    tracing::info!(limit, offset, user_did = ?did, "Get top albums");

    let conn = conn.lock().unwrap();
    let mut stmt = match did {
        Some(_) => conn.prepare(
            r#"
      SELECT
          s.album_id AS id,
          a.title AS title,
          ar.name AS artist,
          ar.uri AS artist_uri,
          a.album_art AS album_art,
          a.release_date,
          a.year,
          a.uri,
          a.sha256,
          COUNT(*) AS play_count,
          COUNT(DISTINCT s.user_id) AS unique_listeners
      FROM
          scrobbles s
      LEFT JOIN
          albums a ON s.album_id = a.id
      LEFT JOIN
          artists ar ON a.artist = ar.name
      LEFT JOIN
          users u ON s.user_id = u.id
      WHERE s.album_id IS NOT NULL AND (u.did = ? OR u.handle = ?) AND ar.name IS NOT NULL
      GROUP BY
          s.album_id, a.title, ar.name, a.release_date, a.year, a.uri, a.album_art, a.sha256, ar.uri
      ORDER BY
          play_count DESC
      OFFSET ?
      LIMIT ?;
  "#,
        )?,
        None => conn.prepare(
            r#"
      SELECT
          s.album_id AS id,
          a.title AS title,
          ar.name AS artist,
          ar.uri AS artist_uri,
          a.album_art AS album_art,
          a.release_date,
          a.year,
          a.uri,
          a.sha256,
          COUNT(*) AS play_count,
          COUNT(DISTINCT s.user_id) AS unique_listeners
      FROM
          scrobbles s
      LEFT JOIN
          albums a ON s.album_id = a.id
      LEFT JOIN
          artists ar ON a.artist = ar.name WHERE s.album_id IS NOT NULL
      GROUP BY
          s.album_id, a.title, ar.name, a.release_date, a.year, a.uri, a.album_art, a.sha256, ar.uri
      ORDER BY
          play_count DESC
      OFFSET ?
      LIMIT ?;
    "#,
        )?,
    };

    match did {
        Some(did) => {
            let albums = stmt.query_map(
                [&did, &did, &limit.to_string(), &offset.to_string()],
                |row| {
                    Ok(Album {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        artist: row.get(2)?,
                        artist_uri: row.get(3)?,
                        album_art: row.get(4)?,
                        release_date: row.get(5)?,
                        year: row.get(6)?,
                        uri: row.get(7)?,
                        sha256: row.get(8)?,
                        play_count: Some(row.get(9)?),
                        unique_listeners: Some(row.get(10)?),
                        ..Default::default()
                    })
                },
            )?;
            let albums: Result<Vec<_>, _> = albums.collect();
            Ok(HttpResponse::Ok().json(web::Json(albums?)))
        }
        None => {
            let albums = stmt.query_map([limit, offset], |row| {
                Ok(Album {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    artist_uri: row.get(3)?,
                    album_art: row.get(4)?,
                    release_date: row.get(5)?,
                    year: row.get(6)?,
                    uri: row.get(7)?,
                    sha256: row.get(8)?,
                    play_count: Some(row.get(9)?),
                    unique_listeners: Some(row.get(10)?),
                    ..Default::default()
                })
            })?;
            let albums: Result<Vec<_>, _> = albums.collect();
            Ok(HttpResponse::Ok().json(web::Json(albums?)))
        }
    }
}

pub async fn get_album_tracks(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetAlbumTracksParams>(&body)?;
    let conn = conn.lock().unwrap();
    tracing::info!(album_id = %params.album_id, "Get album tracks");

    let mut stmt = conn.prepare(r#"
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
      t.copyright_message,
      t.label,
      t.created_at,
      COUNT(*) AS play_count,
      COUNT(DISTINCT s.user_id) AS unique_listeners
    FROM album_tracks at
    LEFT JOIN tracks t ON at.track_id = t.id
    LEFT JOIN albums a ON at.album_id = a.id
    LEFT JOIN scrobbles s ON s.track_id = t.id
    WHERE at.album_id = ? OR a.uri = ?
    GROUP BY
      t.id, t.title, t.artist, t.album_artist, t.album, t.uri, t.album_art, t.duration, t.disc_number, t.track_number, t.artist_uri, t.album_uri, t.sha256, t.copyright_message, t.label, t.created_at
    ORDER BY t.track_number ASC;
  "#)?;

    let tracks = stmt.query_map([&params.album_id, &params.album_id], |row| {
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
            copyright_message: row.get(13)?,
            label: row.get(14)?,
            created_at: row.get(15)?,
            play_count: Some(row.get(16)?),
            unique_listeners: Some(row.get(17)?),
            ..Default::default()
        })
    })?;

    let tracks: Result<Vec<_>, _> = tracks.collect();
    Ok(HttpResponse::Ok().json(web::Json(tracks?)))
}
