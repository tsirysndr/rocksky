use std::sync::{Arc, Mutex};

use actix_web::{web, HttpRequest, HttpResponse};
use analytics::types::scrobble::{GetScrobblesParams, ScrobbleTrack};
use duckdb::Connection;
use anyhow::Error;
use tokio_stream::StreamExt;

use crate::read_payload;

pub async fn get_scrobbles(payload: &mut web::Payload, _req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetScrobblesParams>(&body)?;
    let pagination = params.pagination.unwrap_or_default();
    let offset = pagination.skip.unwrap_or(0);
    let limit = pagination.take.unwrap_or(20);
    let did = params.user_did;

    let conn = conn.lock().unwrap();
    let mut stmt = match did {
        Some(_) => conn.prepare(r#"
            SELECT
                s.id,
                t.id as track_id,
                t.title,
                t.artist,
                t.album_artist,
                t.album,
                t.album_art,
                u.handle,
                u.did,
                s.uri,
                t.uri as track_uri,
                a.uri as artist_uri,
                al.uri as album_uri,
                s.created_at
            FROM scrobbles s
            LEFT JOIN artists a ON s.artist_id = a.id
            LEFT JOIN albums al ON s.album_id = al.id
            LEFT JOIN tracks t ON s.track_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE u.did = ? OR u.handle = ?
            GROUP BY s.id, s.created_at, t.id, t.title, t.artist, t.album_artist, t.album, t.album_art, s.uri, t.uri, u.handle, a.uri, al.uri, s.created_at
            ORDER BY s.created_at DESC
            OFFSET ?
            LIMIT ?;
        "#)?,
        None => conn.prepare(r#"
            SELECT
                s.id,
                t.id as track_id,
                t.title,
                t.artist,
                t.album_artist,
                t.album,
                t.album_art,
                u.handle,
                u.did,
                s.uri,
                t.uri as track_uri,
                a.uri as artist_uri,
                al.uri as album_uri,
                s.created_at
            FROM scrobbles s
            LEFT JOIN artists a ON s.artist_id = a.id
            LEFT JOIN albums al ON s.album_id = al.id
            LEFT JOIN tracks t ON s.track_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            GROUP BY s.id, s.created_at, t.id, t.title, t.artist, t.album_artist, t.album, t.album_art, s.uri, t.uri, u.handle, a.uri, al.uri, s.created_at
            ORDER BY s.created_at DESC
            OFFSET ?
            LIMIT ?;
        "#)?,
    };
    match did {
        Some(did) => {
            let scrobbles = stmt.query_map([&did, &did, &limit.to_string(), &offset.to_string()], |row| {
                Ok(ScrobbleTrack {
                    id: row.get(0)?,
                    track_id: row.get(1)?,
                    title: row.get(2)?,
                    artist: row.get(3)?,
                    album_artist: row.get(4)?,
                    album: row.get(5)?,
                    album_art: row.get(6)?,
                    handle: row.get(7)?,
                    did: row.get(8)?,
                    uri: row.get(9)?,
                    track_uri: row.get(10)?,
                    artist_uri: row.get(11)?,
                    album_uri: row.get(12)?,
                    created_at: row.get(13)?,
                })
            })?;
            let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
            Ok(HttpResponse::Ok().json(scrobbles?))
        },
        None => {
            let scrobbles = stmt.query_map([limit, offset], |row| {
                Ok(ScrobbleTrack {
                    id: row.get(0)?,
                    track_id: row.get(1)?,
                    title: row.get(2)?,
                    artist: row.get(3)?,
                    album_artist: row.get(4)?,
                    album: row.get(5)?,
                    album_art: row.get(6)?,
                    handle: row.get(7)?,
                    did: row.get(8)?,
                    uri: row.get(9)?,
                    track_uri: row.get(10)?,
                    artist_uri: row.get(11)?,
                    album_uri: row.get(12)?,
                    created_at: row.get(13)?,
                })
            })?;
            let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
            Ok(HttpResponse::Ok().json(scrobbles?))
        }
    }
}

pub async fn get_distinct_scrobbles(payload: &mut web::Payload, _req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetScrobblesParams>(&body)?;
    let pagination = params.pagination.unwrap_or_default();
    let offset = pagination.skip.unwrap_or(0);
    let limit = pagination.take.unwrap_or(10);

    let conn = conn.lock().unwrap();
    let mut stmt =  conn.prepare(r#"
        WITH ranked_scrobbles AS (
            SELECT
                s.id,
                t.id AS track_id,
                t.title,
                t.artist,
                t.album_artist,
                t.album,
                t.album_art,
                u.handle,
                u.did,
                s.uri,
                t.uri AS track_uri,
                a.uri AS artist_uri,
                al.uri AS album_uri,
                s.created_at,
                ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY s.created_at DESC
            ) AS rn
            FROM scrobbles s
            LEFT JOIN artists a ON s.artist_id = a.id
            LEFT JOIN albums al ON s.album_id = al.id
            LEFT JOIN tracks t ON s.track_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
        )
        SELECT
            id,
            track_id,
            title,
            artist,
            album_artist,
            album,
            album_art,
            handle,
            did,
            uri,
            track_uri,
            artist_uri,
            album_uri,
            created_at
        FROM ranked_scrobbles
        WHERE rn = 1
        ORDER BY created_at DESC
        OFFSET ?
        LIMIT ?;
    "#)?;

    let scrobbles = stmt.query_map([limit, offset], |row| {
        Ok(ScrobbleTrack {
            id: row.get(0)?,
            track_id: row.get(1)?,
            title: row.get(2)?,
            artist: row.get(3)?,
            album_artist: row.get(4)?,
            album: row.get(5)?,
            album_art: row.get(6)?,
            handle: row.get(7)?,
            did: row.get(8)?,
            uri: row.get(9)?,
            track_uri: row.get(10)?,
            artist_uri: row.get(11)?,
            album_uri: row.get(12)?,
            created_at: row.get(13)?,
        })
    })?;
    let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
    Ok(HttpResponse::Ok().json(scrobbles?))
}

