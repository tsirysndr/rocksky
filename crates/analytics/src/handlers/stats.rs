use std::sync::{Arc, Mutex};

use crate::read_payload;
use crate::types::{
    scrobble::{ScrobblesPerDay, ScrobblesPerMonth, ScrobblesPerYear},
    stats::{
        GetAlbumScrobblesParams, GetArtistScrobblesParams, GetScrobblesPerDayParams,
        GetScrobblesPerMonthParams, GetScrobblesPerYearParams, GetStatsParams,
        GetTrackScrobblesParams,
    },
};
use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;
use duckdb::Connection;
use serde_json::json;
use tokio_stream::StreamExt;

pub async fn get_stats(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);

    let params = serde_json::from_slice::<GetStatsParams>(&body)?;

    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM scrobbles s LEFT JOIN users u ON s.user_id = u.id WHERE u.did = ? OR u.handle = ?")?;
    let scrobbles: i64 = stmt.query_row([&params.user_did, &params.user_did], |row| row.get(0))?;

    let mut stmt = conn.prepare(
        r#"
        SELECT COUNT(*) FROM (
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
        )
    "#,
    )?;
    let artists: i64 = stmt.query_row([&params.user_did, &params.user_did], |row| row.get(0))?;

    let mut stmt = conn.prepare("SELECT COUNT(*) FROM loved_tracks LEFT JOIN users u ON loved_tracks.user_id = u.id WHERE u.did = ? OR u.handle = ?")?;
    let loved_tracks: i64 =
        stmt.query_row([&params.user_did, &params.user_did], |row| row.get(0))?;

    let mut stmt = conn.prepare(r#"SELECT COUNT(*) FROM (
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
        WHERE s.album_id IS NOT NULL AND (u.did = ? OR u.handle = ?)
        GROUP BY
            s.album_id, a.title, ar.name, a.release_date, a.year, a.uri, a.album_art, a.sha256, ar.uri
    )"#)?;
    let albums: i64 = stmt.query_row([&params.user_did, &params.user_did], |row| row.get(0))?;

    let mut stmt = conn.prepare(
        r#"
        SELECT COUNT(*) FROM tracks t
        LEFT JOIN user_tracks ut ON ut.track_id = t.id
        LEFT JOIN users u ON ut.user_id = u.id
        WHERE u.did = ? OR u.handle = ?
    "#,
    )?;
    let tracks: i64 = stmt.query_row([&params.user_did, &params.user_did], |row| row.get(0))?;

    Ok(HttpResponse::Ok().json(json!({
        "scrobbles": scrobbles,
        "artists": artists,
        "loved_tracks": loved_tracks,
        "albums": albums,
        "tracks": tracks,
    })))
}

pub async fn get_scrobbles_per_day(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetScrobblesPerDayParams>(&body)?;
    let start = params
        .start
        .unwrap_or(GetScrobblesPerDayParams::default().start.unwrap());
    let end = params
        .end
        .unwrap_or(GetScrobblesPerDayParams::default().end.unwrap());
    let did = params.user_did;

    let conn = conn.lock().unwrap();
    match did {
        Some(did) => {
            let mut stmt = conn.prepare(
                r#"
            SELECT
                date_trunc('day', created_at) AS date,
                COUNT(track_id) AS count
            FROM
                scrobbles
            LEFT JOIN users u ON scrobbles.user_id = u.id
            WHERE
                u.did = ? OR u.handle = ?
                AND created_at BETWEEN ? AND ?
            GROUP BY
                date_trunc('day', created_at)
            ORDER BY
                date;
            "#,
            )?;
            let scrobbles = stmt.query_map([&did, &did, &start, &end], |row| {
                Ok(ScrobblesPerDay {
                    date: row.get(0)?,
                    count: row.get(1)?,
                })
            })?;
            let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
            Ok(HttpResponse::Ok().json(scrobbles?))
        }
        None => {
            let mut stmt = conn.prepare(
                r#"
            SELECT
                date_trunc('day', created_at) AS date,
                COUNT(track_id) AS count
            FROM
                scrobbles
            WHERE
                created_at BETWEEN ? AND ?
            GROUP BY
                date_trunc('day', created_at)
            ORDER BY
                date;
            "#,
            )?;
            let scrobbles = stmt.query_map([start, end], |row| {
                Ok(ScrobblesPerDay {
                    date: row.get(0)?,
                    count: row.get(1)?,
                })
            })?;
            let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
            Ok(HttpResponse::Ok().json(scrobbles?))
        }
    }
}

pub async fn get_scrobbles_per_month(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetScrobblesPerMonthParams>(&body)?;
    let start = params
        .start
        .unwrap_or(GetScrobblesPerDayParams::default().start.unwrap());
    let end = params
        .end
        .unwrap_or(GetScrobblesPerDayParams::default().end.unwrap());
    let did = params.user_did;

    let conn = conn.lock().unwrap();
    match did {
        Some(did) => {
            let mut stmt = conn.prepare(
                r#"
            SELECT
                EXTRACT(YEAR FROM created_at) || '-' ||
                LPAD(EXTRACT(MONTH FROM created_at)::VARCHAR, 2, '0') AS year_month,
                COUNT(*) AS count
            FROM
                scrobbles
            LEFT JOIN users u ON scrobbles.user_id = u.id
            WHERE
                u.did = ? OR u.handle = ?
                AND created_at BETWEEN ? AND ?
            GROUP BY
                EXTRACT(YEAR FROM created_at),
                EXTRACT(MONTH FROM created_at)
            ORDER BY
                year_month;
            "#,
            )?;
            let scrobbles = stmt.query_map([&did, &did, &start, &end], |row| {
                Ok(ScrobblesPerMonth {
                    year_month: row.get(0)?,
                    count: row.get(1)?,
                })
            })?;
            let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
            Ok(HttpResponse::Ok().json(scrobbles?))
        }
        None => {
            let mut stmt = conn.prepare(
                r#"
            SELECT
                EXTRACT(YEAR FROM created_at) || '-' ||
                LPAD(EXTRACT(MONTH FROM created_at)::VARCHAR, 2, '0') AS year_month,
                COUNT(*) AS count
            FROM
                scrobbles
            WHERE
                created_at BETWEEN ? AND ?
            GROUP BY
                EXTRACT(YEAR FROM created_at),
                EXTRACT(MONTH FROM created_at)
            ORDER BY
                year_month;
            "#,
            )?;
            let scrobbles = stmt.query_map([start, end], |row| {
                Ok(ScrobblesPerMonth {
                    year_month: row.get(0)?,
                    count: row.get(1)?,
                })
            })?;
            let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
            Ok(HttpResponse::Ok().json(scrobbles?))
        }
    }
}

pub async fn get_scrobbles_per_year(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetScrobblesPerYearParams>(&body)?;
    let start = params
        .start
        .unwrap_or(GetScrobblesPerDayParams::default().start.unwrap());
    let end = params
        .end
        .unwrap_or(GetScrobblesPerDayParams::default().end.unwrap());
    let did = params.user_did;

    let conn = conn.lock().unwrap();
    match did {
        Some(did) => {
            let mut stmt = conn.prepare(
                r#"
            SELECT
                EXTRACT(YEAR FROM created_at) AS year,
                COUNT(*) AS count
            FROM
                scrobbles
            LEFT JOIN users u ON scrobbles.user_id = u.id
            WHERE
                u.did = ? OR u.handle = ?
                AND created_at BETWEEN ? AND ?
            GROUP BY
                EXTRACT(YEAR FROM created_at)
            ORDER BY
                year;
            "#,
            )?;
            let scrobbles = stmt.query_map([&did, &did, &start, &end], |row| {
                Ok(ScrobblesPerYear {
                    year: row.get(0)?,
                    count: row.get(1)?,
                })
            })?;
            let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
            Ok(HttpResponse::Ok().json(scrobbles?))
        }
        None => {
            let mut stmt = conn.prepare(
                r#"
            SELECT
                EXTRACT(YEAR FROM created_at) AS year,
                COUNT(*) AS count
            FROM
                scrobbles
            WHERE
                created_at BETWEEN ? AND ?
            GROUP BY
                EXTRACT(YEAR FROM created_at)
            ORDER BY
                year;
            "#,
            )?;
            let scrobbles = stmt.query_map([start, end], |row| {
                Ok(ScrobblesPerYear {
                    year: row.get(0)?,
                    count: row.get(1)?,
                })
            })?;
            let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
            Ok(HttpResponse::Ok().json(scrobbles?))
        }
    }
}

pub async fn get_album_scrobbles(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetAlbumScrobblesParams>(&body)?;
    let start = params
        .start
        .unwrap_or(GetAlbumScrobblesParams::default().start.unwrap());
    let end = params
        .end
        .unwrap_or(GetAlbumScrobblesParams::default().end.unwrap());
    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare(
        r#"
        SELECT
            date_trunc('day', s.created_at) AS date,
            COUNT(s.album_id) AS count
        FROM
            scrobbles s
        LEFT JOIN albums a ON s.album_id = a.id
        WHERE
            a.id = ? OR a.uri = ?
            AND s.created_at BETWEEN ? AND ?
        GROUP BY
            date_trunc('day', s.created_at)
        ORDER BY
            date;
    "#,
    )?;
    let scrobbles = stmt.query_map([&params.album_id, &params.album_id, &start, &end], |row| {
        Ok(ScrobblesPerDay {
            date: row.get(0)?,
            count: row.get(1)?,
        })
    })?;
    let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
    Ok(HttpResponse::Ok().json(scrobbles?))
}

pub async fn get_artist_scrobbles(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetArtistScrobblesParams>(&body)?;
    let start = params
        .start
        .unwrap_or(GetArtistScrobblesParams::default().start.unwrap());
    let end = params
        .end
        .unwrap_or(GetArtistScrobblesParams::default().end.unwrap());
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        r#"
        SELECT
            date_trunc('day', s.created_at) AS date,
            COUNT(s.artist_id) AS count
        FROM
            scrobbles s
        LEFT JOIN artists a ON s.artist_id = a.id
        WHERE
            a.id = ? OR a.uri = ?
            AND s.created_at BETWEEN ? AND ?
        GROUP BY
            date_trunc('day', s.created_at)
        ORDER BY
            date;
    "#,
    )?;

    let scrobbles = stmt.query_map(
        [&params.artist_id, &params.artist_id, &start, &end],
        |row| {
            Ok(ScrobblesPerDay {
                date: row.get(0)?,
                count: row.get(1)?,
            })
        },
    )?;

    let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
    Ok(HttpResponse::Ok().json(scrobbles?))
}

pub async fn get_track_scrobbles(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetTrackScrobblesParams>(&body)?;
    let start = params
        .start
        .unwrap_or(GetTrackScrobblesParams::default().start.unwrap());
    let end = params
        .end
        .unwrap_or(GetTrackScrobblesParams::default().end.unwrap());
    let conn = conn.lock().unwrap();

    let mut stmt = conn.prepare(
        r#"
        SELECT
            date_trunc('day', s.created_at) AS date,
            COUNT(s.track_id) AS count
        FROM
            scrobbles s
        LEFT JOIN tracks t ON s.track_id = t.id
        WHERE
            t.id = ? OR t.uri = ?
            AND s.created_at BETWEEN ? AND ?
        GROUP BY
            date_trunc('day', s.created_at)
        ORDER BY
            date;
    "#,
    )?;

    let scrobbles = stmt.query_map([&params.track_id, &params.track_id, &start, &end], |row| {
        Ok(ScrobblesPerDay {
            date: row.get(0)?,
            count: row.get(1)?,
        })
    })?;

    let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
    Ok(HttpResponse::Ok().json(scrobbles?))
}
