use std::sync::{Arc, Mutex};

use actix_web::{web, HttpRequest, HttpResponse};
use analytics::types::{album::Album, artist::{Artist, GetArtistAlbumsParams, GetArtistTracksParams, GetArtistsParams, GetTopArtistsParams}, track::Track};
use duckdb::Connection;
use anyhow::Error;
use tokio_stream::StreamExt;

use crate::read_payload;

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
            SELECT a.*,
                COUNT(*) AS play_count,
                COUNT(DISTINCT s.user_id) AS unique_listeners
             FROM user_artists ua
            LEFT JOIN artists a ON ua.artist_id = a.id
            LEFT JOIN users u ON ua.user_id = u.id
            LEFT JOIN scrobbles s ON s.artist_id = a.id
            WHERE u.did = ? OR u.handle = ?
            GROUP BY a.*
            ORDER BY play_count DESC OFFSET ? LIMIT ?;
            "#)?
        },
        None => {
            conn.prepare("SELECT a.*,
                COUNT(*) AS play_count,
                COUNT(DISTINCT s.user_id) AS unique_listeners
             FROM artists a
             LEFT JOIN scrobbles s ON s.artist_id = a.id
             GROUP BY a.*
             ORDER BY play_count DESC OFFSET ? LIMIT ?")?
        }
    };

    match did {
        Some(did) => {
            let artists = stmt.query_map([&did, &did, &limit.to_string(), &offset.to_string()], |row| {
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
                    play_count: row.get(13)?,
                    unique_listeners: row.get(14)?,
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
                    play_count: row.get(13)?,
                    unique_listeners: row.get(14)?,
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
                    s.artist_id IS NOT NULL AND (u.did = ? OR u.handle = ?)
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
            let artists = stmt.query_map([&did, &did, &limit.to_string(), &offset.to_string()], |row| {
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

pub async fn get_artist_tracks(payload: &mut web::Payload, _req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetArtistTracksParams>(&body)?;
    let pagination = params.pagination.unwrap_or_default();
    let offset = pagination.skip.unwrap_or(0);
    let limit = pagination.take.unwrap_or(20);
    let conn = conn.lock().unwrap();

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
        FROM artist_tracks at
        LEFT JOIN tracks t ON at.track_id = t.id
        LEFT JOIN artists a ON at.artist_id = a.id
        LEFT JOIN scrobbles s ON s.track_id = t.id
        WHERE at.artist_id = ? OR a.uri = ?
        GROUP BY
            t.id, t.title, t.artist, t.album_artist, t.album, t.uri, t.album_art, t.duration, t.disc_number, t.track_number, t.artist_uri, t.album_uri, t.sha256, t.copyright_message, t.label, t.created_at
        ORDER BY play_count DESC
        OFFSET ?
        LIMIT ?;
    "#)?;

    let tracks = stmt.query_map([&params.artist_id, &params.artist_id, &limit.to_string(), &offset.to_string()], |row| {
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
    Ok(HttpResponse::Ok().json(tracks?))
}

pub async fn get_artist_albums(payload: &mut web::Payload, _req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetArtistAlbumsParams>(&body)?;
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(r#"
        SELECT
            al.id,
            al.title,
            al.artist,
            al.album_art,
            al.release_date,
            al.year,
            al.uri,
            al.sha256,
            al.artist_uri,
            COUNT(*) AS play_count,
            COUNT(DISTINCT s.user_id) AS unique_listeners
        FROM
            artist_albums aa
        LEFT JOIN artists ar ON aa.artist_id = ar.id
        LEFT JOIN albums al ON aa.album_id = al.id
        LEFT JOIN scrobbles s ON aa.album_id = s.album_id
        WHERE ar.id = ? OR  ar.uri = ?
        GROUP BY al.id, al.title, al.artist, al.album_art, al.release_date, al.year, al.uri, al.sha256, al.artist_uri
        ORDER BY play_count DESC;
    "#)?;

    let albums = stmt.query_map([&params.artist_id, &params.artist_id], |row| {
        Ok(Album {
            id: row.get(0)?,
            title: row.get(1)?,
            artist: row.get(2)?,
            release_date: row.get(3)?,
            album_art: row.get(4)?,
            year: row.get(5)?,
            spotify_link: None,
            tidal_link: None,
            youtube_link: None,
            apple_music_link: None,
            sha256: row.get(7)?,
            uri: row.get(6)?,
            artist_uri: row.get(8)?,
            play_count: Some(row.get(9)?),
            unique_listeners: Some(row.get(10)?),
        })
    })?;

    let albums: Result<Vec<_>, _> = albums.collect();
    Ok(HttpResponse::Ok().json(albums?))
}
