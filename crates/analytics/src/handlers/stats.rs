use std::sync::{Arc, Mutex};

use actix_web::{web, HttpRequest, HttpResponse};
use analytics::types::{scrobble::{ScrobblesPerDay, ScrobblesPerMonth, ScrobblesPerYear}, stats::{GetScrobblesPerDayParams, GetScrobblesPerMonthParams, GetScrobblesPerYearParams, GetStatsParams}};
use duckdb::Connection;
use anyhow::Error;
use serde_json::json;
use futures_util::StreamExt;
use crate::read_payload;

pub async fn get_stats(payload: &mut web::Payload, _req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetStatsParams>(&body)?;

    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM scrobbles s LEFT JOIN users u ON s.user_id = u.id WHERE u.did = ?")?;
    let scrobbles: i64 = stmt.query_row([&params.user_did], |row| row.get(0))?;

    let mut stmt = conn.prepare("SELECT COUNT(*) FROM user_artists LEFT JOIN users u ON user_artists.user_id = u.id WHERE u.did = ?")?;
    let artists: i64 = stmt.query_row([&params.user_did], |row| row.get(0))?;

    let mut stmt = conn.prepare("SELECT COUNT(*) FROM loved_tracks LEFT JOIN users u ON loved_tracks.user_id = u.id WHERE u.did = ?")?;
    let loved_tracks: i64 = stmt.query_row([&params.user_did], |row| row.get(0))?;

    let mut stmt = conn.prepare("SELECT COUNT(*) FROM user_albums LEFT JOIN users u ON user_albums.user_id = u.id WHERE u.did = ?")?;
    let albums: i64 = stmt.query_row([&params.user_did], |row| row.get(0))?;

    let mut stmt = conn.prepare("SELECT COUNT(*) FROM user_tracks LEFT JOIN users u ON user_tracks.user_id = u.id WHERE u.did = ?")?;
    let tracks: i64 = stmt.query_row([&params.user_did], |row| row.get(0))?;

    Ok(HttpResponse::Ok().json(json!({
        "scrobbles": scrobbles,
        "artists": artists,
        "loved_tracks": loved_tracks,
        "albums": albums,
        "tracks": tracks,
    })))
}

pub async fn get_scrobbles_per_day(payload: &mut web::Payload, _req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetScrobblesPerDayParams>(&body)?;
    let start = params.start.unwrap_or(GetScrobblesPerDayParams::default().start.unwrap());
    let end = params.end.unwrap_or(GetScrobblesPerDayParams::default().end.unwrap());
    let did = params.user_did;

    let conn = conn.lock().unwrap();
    match did {
        Some(did) => {
            let mut stmt = conn.prepare(r#"
            SELECT
                date_trunc('day', created_at) AS date,
                COUNT(track_id) AS count
            FROM
                scrobbles
            LEFT JOIN users u ON scrobbles.user_id = u.id
            WHERE
                u.did = ?
                AND created_at BETWEEN ? AND ?
            GROUP BY
                date_trunc('day', created_at)
            ORDER BY
                date;
            "#)?;
            let scrobbles = stmt.query_map([did, start, end], |row| {
                Ok(ScrobblesPerDay {
                    date: row.get(0)?,
                    count: row.get(1)?,
                })
            })?;
            let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
            Ok(HttpResponse::Ok().json(scrobbles?))
        },
        None => {
            let mut stmt = conn.prepare(r#"
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
            "#)?;
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

pub async fn get_scrobbles_per_month(payload: &mut web::Payload, _req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetScrobblesPerMonthParams>(&body)?;
    let start = params.start.unwrap_or(GetScrobblesPerDayParams::default().start.unwrap());
    let end = params.end.unwrap_or(GetScrobblesPerDayParams::default().end.unwrap());
    let did = params.user_did;

    let conn = conn.lock().unwrap();
    match did {
        Some(did) => {
            let mut stmt = conn.prepare(r#"
            SELECT
                EXTRACT(YEAR FROM created_at) || '-' ||
                LPAD(EXTRACT(MONTH FROM created_at)::VARCHAR, 2, '0') AS year_month,
                COUNT(*) AS count
            FROM
                scrobbles
            LEFT JOIN users u ON scrobbles.user_id = u.id
            WHERE
                u.did = ?
                AND created_at BETWEEN ? AND ?
            GROUP BY
                EXTRACT(YEAR FROM created_at),
                EXTRACT(MONTH FROM created_at)
            ORDER BY
                year_month;
            "#)?;
            let scrobbles = stmt.query_map([did, start, end], |row| {
                Ok(ScrobblesPerMonth {
                    year_month: row.get(0)?,
                    count: row.get(1)?,
                })
            })?;
            let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
            Ok(HttpResponse::Ok().json(scrobbles?))
        },
        None => {
            let mut stmt = conn.prepare(r#"
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
            "#)?;
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

pub async fn get_scrobbles_per_year(payload: &mut web::Payload, _req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetScrobblesPerYearParams>(&body)?;
    let start = params.start.unwrap_or(GetScrobblesPerDayParams::default().start.unwrap());
    let end = params.end.unwrap_or(GetScrobblesPerDayParams::default().end.unwrap());
    let did = params.user_did;

    let conn = conn.lock().unwrap();
    match did {
        Some(did) => {
            let mut stmt = conn.prepare(r#"
            SELECT
                EXTRACT(YEAR FROM created_at) AS year,
                COUNT(*) AS count
            FROM
                scrobbles
            LEFT JOIN users u ON scrobbles.user_id = u.id
            WHERE
                u.did = ?
                AND created_at BETWEEN ? AND ?
            GROUP BY
                EXTRACT(YEAR FROM created_at)
            ORDER BY
                year;
            "#)?;
            let scrobbles = stmt.query_map([did, start, end], |row| {
                Ok(ScrobblesPerYear {
                    year: row.get(0)?,
                    count: row.get(1)?,
                })
            })?;
            let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
            Ok(HttpResponse::Ok().json(scrobbles?))
        },
        None => {
            let mut stmt = conn.prepare(r#"
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
            "#)?;
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
