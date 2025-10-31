use std::sync::{Arc, Mutex};

use crate::types::{
    album::Album,
    artist::{
        Artist, ArtistListener, GetArtistAlbumsParams, GetArtistListenersParams,
        GetArtistTracksParams, GetArtistsParams, GetTopArtistsParams,
    },
    track::Track,
};
use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;
use duckdb::Connection;
use tokio_stream::StreamExt;

use crate::read_payload;

pub async fn get_artists(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetArtistsParams>(&body)?;
    let pagination = params.pagination.unwrap_or_default();
    let offset = pagination.skip.unwrap_or(0);
    let limit = pagination.take.unwrap_or(20);
    let did = params.user_did;

    let conn = conn.lock().unwrap();
    let mut stmt = match did {
        Some(_) => conn.prepare(
            r#"
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
            "#,
        )?,
        None => conn.prepare(
            "SELECT a.*,
                COUNT(*) AS play_count,
                COUNT(DISTINCT s.user_id) AS unique_listeners
             FROM artists a
             LEFT JOIN scrobbles s ON s.artist_id = a.id
             GROUP BY a.*
             ORDER BY play_count DESC OFFSET ? LIMIT ?",
        )?,
    };

    match did {
        Some(did) => {
            let artists = stmt.query_map(
                [&did, &did, &limit.to_string(), &offset.to_string()],
                |row| {
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
                },
            )?;

            let artists: Result<Vec<_>, _> = artists.collect();
            Ok(HttpResponse::Ok().json(artists?))
        }
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

pub async fn get_top_artists(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetTopArtistsParams>(&body)?;
    let pagination = params.pagination.unwrap_or_default();
    let offset = pagination.skip.unwrap_or(0);
    let limit = pagination.take.unwrap_or(20);
    let did = params.user_did;

    let conn = conn.lock().unwrap();
    let mut stmt = match did {
        Some(_) => conn.prepare(
            r#"
                SELECT
                    s.artist_id AS id,
                    ar.name AS artist_name,
                    ar.picture AS picture,
                    ar.sha256 AS sha256,
                    ar.uri AS uri,
                    COUNT(DISTINCT s.created_at) AS play_count,
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
            "#,
        )?,
        None => conn.prepare(
            r#"
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
            "#,
        )?,
    };

    match did {
        Some(did) => {
            let artists = stmt.query_map(
                [&did, &did, &limit.to_string(), &offset.to_string()],
                |row| {
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
                },
            )?;

            let artists: Result<Vec<_>, _> = artists.collect();
            Ok(HttpResponse::Ok().json(artists?))
        }
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

pub async fn get_artist_tracks(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
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
            COUNT(DISTINCT s.created_at) AS play_count,
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

    let tracks = stmt.query_map(
        [
            &params.artist_id,
            &params.artist_id,
            &limit.to_string(),
            &offset.to_string(),
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
                copyright_message: row.get(13)?,
                label: row.get(14)?,
                created_at: row.get(15)?,
                play_count: Some(row.get(16)?),
                unique_listeners: Some(row.get(17)?),
                ..Default::default()
            })
        },
    )?;

    let tracks: Result<Vec<_>, _> = tracks.collect();
    Ok(HttpResponse::Ok().json(tracks?))
}

pub async fn get_artist_albums(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetArtistAlbumsParams>(&body)?;
    let conn = conn.lock().unwrap();
    tracing::info!(artist_id = %params.artist_id, "Get artist albums");

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
            album_art: row.get(3)?,
            release_date: row.get(4)?,
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

pub async fn get_artist_listeners(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetArtistListenersParams>(&body)?;
    let pagination = params.pagination.unwrap_or_default();
    let offset = pagination.skip.unwrap_or(0);
    let limit = pagination.take.unwrap_or(10);
    tracing::info!(artist_id = %params.artist_id, limit, offset, "Get artist listeners");

    let conn = conn.lock().unwrap();
    let mut stmt =
        conn.prepare("SELECT id, name, uri FROM artists WHERE id = ? OR uri = ? OR name = ?")?;
    let artist = stmt.query_row(
        [&params.artist_id, &params.artist_id, &params.artist_id],
        |row| {
            Ok(crate::types::artist::ArtistBasic {
                id: row.get(0)?,
                name: row.get(1)?,
                uri: row.get(2)?,
            })
        },
    )?;

    if artist.id.is_empty() {
        return Ok(HttpResponse::Ok().json(Vec::<ArtistListener>::new()));
    }

    let mut stmt = conn.prepare(
        r#"
        WITH user_track_counts AS (
        SELECT
            s.user_id,
            s.track_id,
            t.album_artist AS artist,
            t.title as track_title,
            t.uri as track_uri,
            COUNT(*) as play_count
        FROM scrobbles s
        JOIN tracks t ON s.track_id = t.id
        WHERE t.album_artist = ?
        GROUP BY s.user_id, s.track_id, t.title, t.uri, t.album_artist
    ),
    user_top_tracks AS (
        SELECT
            user_id,
            artist,
            track_id,
            track_title,
            track_uri,
            play_count,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY play_count DESC, track_title) as rn
        FROM user_track_counts
    ),
    artist_listener_counts AS (
        SELECT
            user_id,
            artist,
            SUM(play_count) as total_artist_plays
        FROM user_track_counts
        GROUP BY user_id, artist
    ),
    top_artist_listeners AS (
        SELECT
            user_id,
            artist,
            total_artist_plays,
            ROW_NUMBER() OVER (ORDER BY total_artist_plays DESC) as listener_rank
        FROM artist_listener_counts
    ),
    paginated_listeners AS (
        SELECT
            user_id,
            artist,
            total_artist_plays,
            listener_rank
        FROM top_artist_listeners
        ORDER BY listener_rank
        LIMIT ? OFFSET ?
    )
    SELECT
        pl.artist,
        pl.listener_rank,
        u.id as user_id,
        u.display_name,
        u.did,
        u.handle,
        u.avatar,
        pl.total_artist_plays,
        utt.track_title as most_played_track,
        utt.track_uri as most_played_track_uri,
        utt.play_count as track_play_count
    FROM paginated_listeners pl
    JOIN users u ON pl.user_id = u.id
    JOIN user_top_tracks utt ON pl.user_id = utt.user_id
        AND utt.rn = 1
    ORDER BY pl.listener_rank;
    "#,
    )?;

    let listeners = stmt.query_map(
        [&artist.name, &limit.to_string(), &offset.to_string()],
        |row| {
            Ok(ArtistListener {
                artist: row.get(0)?,
                listener_rank: row.get(1)?,
                user_id: row.get(2)?,
                display_name: row.get(3)?,
                did: row.get(4)?,
                handle: row.get(5)?,
                avatar: row.get(6)?,
                total_artist_plays: row.get(7)?,
                most_played_track: row.get(8)?,
                most_played_track_uri: row.get(9)?,
                track_play_count: row.get(10)?,
            })
        },
    )?;

    let listeners: Result<Vec<_>, _> = listeners.collect();
    Ok(HttpResponse::Ok().json(listeners?))
}
