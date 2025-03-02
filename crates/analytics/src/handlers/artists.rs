use std::sync::{Arc, Mutex};

use actix_web::{web, HttpRequest, HttpResponse};
use analytics::types::artist::{Artist, GetTopArtistsParams};
use duckdb::Connection;
use anyhow::Error;
use futures_util::StreamExt;

use crate::{read_payload, types::artist::GetArtistsParams};

pub async fn get_artists(payload: &mut web::Payload, _req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetArtistsParams>(&body)?;
    let pagination = params.pagination.unwrap_or_default();
    let offset = pagination.skip.unwrap_or(0);
    let limit = pagination.take.unwrap_or(20);
    let did = params.user_did;

    let conn = conn.lock().unwrap();
    let mut stmt = match did {
        Some(_) => {
            conn.prepare(r#"
            SELECT a.* FROM user_artists ua
            LEFT JOIN artists a ON ua.artist_id = a.id
            LEFT JOIN users u ON ua.user_id = u.id
            WHERE u.did = ?
            ORDER BY a.name ASC OFFSET ? LIMIT ?;
            "#)?
        },
        None => {
            conn.prepare("SELECT * FROM artists ORDER BY name ASC OFFSET ? LIMIT ?")?
        }
    };

    match did {
        Some(did) => {
            let artists = stmt.query_map([did, limit.to_string(), offset.to_string()], |row| {
                Ok(Artist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    biography: row.get(2)?,
                    born: row.get(3)?,
                    born_in: row.get(4)?,
                    died: row.get(5)?,
                    picture: row.get(6)?,
                    sha256: row.get(7)?,
                    spotify_link: row.get(8)?,
                    tidal_link: row.get(9)?,
                    youtube_link: row.get(10)?,
                    apple_music_link: row.get(11)?,
                    uri: row.get(12)?,
                    play_count: None,
                    unique_listeners: None,
                })
            })?;

            let artists: Result<Vec<_>, _> = artists.collect();
            Ok(HttpResponse::Ok().json(artists?))
        },
        None => {
            let artists = stmt.query_map([limit, offset], |row| {
                Ok(Artist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    biography: row.get(2)?,
                    born: row.get(3)?,
                    born_in: row.get(4)?,
                    died: row.get(5)?,
                    picture: row.get(6)?,
                    sha256: row.get(7)?,
                    spotify_link: row.get(8)?,
                    tidal_link: row.get(9)?,
                    youtube_link: row.get(10)?,
                    apple_music_link: row.get(11)?,
                    uri: row.get(12)?,
                    play_count: None,
                    unique_listeners: None,
                })
            })?;

            let artists: Result<Vec<_>, _> = artists.collect();
            Ok(HttpResponse::Ok().json(artists?))
        }
    }
}

pub async fn get_top_artists(payload: &mut web::Payload, _req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetTopArtistsParams>(&body)?;
    let pagination = params.pagination.unwrap_or_default();
    let offset = pagination.skip.unwrap_or(0);
    let limit = pagination.take.unwrap_or(20);
    let did = params.user_did;

    let conn = conn.lock().unwrap();
    let mut stmt = match did {
        Some(_) => {
            conn.prepare(r#"
                SELECT
                    s.artist_id AS id,
                    ar.name AS artist_name,
                    ar.picture AS picture,
                    ar.sha256 AS sha256,
                    ar.uri AS uri,
                    COUNT(*) AS play_count,
                    COUNT(DISTINCT s.user_id) AS unique_listeners
                FROM
                    scrobbles s
                LEFT JOIN
                    artists ar ON s.artist_id = ar.id
                LEFT JOIN
                    users u ON s.user_id = u.id
                WHERE
                    s.artist_id IS NOT NULL AND u.did = ?
                GROUP BY
                    s.artist_id, ar.name, ar.uri, ar.picture, ar.sha256
                ORDER BY
                    play_count DESC
                OFFSET ?
                LIMIT ?;
            "#)?
        },
        None => {
            conn.prepare(r#"
                SELECT
                    s.artist_id AS id,
                    ar.name AS artist_name,
                    ar.picture AS picture,
                    ar.sha256 AS sha256,
                    ar.uri AS uri,
                    COUNT(*) AS play_count,
                    COUNT(DISTINCT s.user_id) AS unique_listeners
                FROM
                    scrobbles s
                LEFT JOIN
                    artists ar ON s.artist_id = ar.id
                WHERE
                    s.artist_id IS NOT NULL
                GROUP BY
                    s.artist_id, ar.name, ar.uri, ar.picture, ar.sha256
                ORDER BY
                    play_count DESC
                OFFSET ?
                LIMIT ?;
            "#)?
        }
    };

    match did {
        Some(did) => {
            let artists = stmt.query_map([did, limit.to_string(), offset.to_string()], |row| {
                Ok(Artist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    biography: None,
                    born: None,
                    born_in: None,
                    died: None,
                    picture: row.get(2)?,
                    sha256: row.get(3)?,
                    spotify_link: None,
                    tidal_link: None,
                    youtube_link: None,
                    apple_music_link: None,
                    uri: row.get(4)?,
                    play_count: Some(row.get(5)?),
                    unique_listeners: Some(row.get(6)?),
                })
            })?;

            let artists: Result<Vec<_>, _> = artists.collect();
            Ok(HttpResponse::Ok().json(artists?))
        },
        None => {
            let artists = stmt.query_map([limit, offset], |row| {
                Ok(Artist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    biography: None,
                    born: None,
                    born_in: None,
                    died: None,
                    picture: row.get(2)?,
                    sha256: row.get(3)?,
                    spotify_link: None,
                    tidal_link: None,
                    youtube_link: None,
                    apple_music_link: None,
                    uri: row.get(4)?,
                    play_count: Some(row.get(5)?),
                    unique_listeners: Some(row.get(6)?),
                })
            })?;

            let artists: Result<Vec<_>, _> = artists.collect();
            Ok(HttpResponse::Ok().json(artists?))
        }
    }
}