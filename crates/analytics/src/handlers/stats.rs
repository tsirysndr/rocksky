use std::sync::{Arc, Mutex};

use crate::read_payload;
use crate::types::stats::{
    Compatibility, GetCompatibilityParams, GetNeighboursParams, SharedArtist,
};
use crate::types::{
    scrobble::{ScrobblesPerDay, ScrobblesPerMonth, ScrobblesPerYear},
    stats::{
        GetAlbumScrobblesParams, GetArtistScrobblesParams, GetScrobblesPerDayParams,
        GetScrobblesPerMonthParams, GetScrobblesPerYearParams, GetStatsParams,
        GetTrackScrobblesParams, Neighbour,
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
    tracing::info!(user_did = ?params.user_did, "Get stats");

    let conn = conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT COUNT(DISTINCT s.created_at) FROM scrobbles s LEFT JOIN users u ON s.user_id = u.id WHERE u.did = ? OR u.handle = ?")?;
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
          COUNT(DISTINCT s.created_at) AS play_count,
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
    let genre = params.genre;
    tracing::info!(start = %start, end = %end, user_did = ?did, "Get scrobbles per day");

    let conn = conn.lock().unwrap();
    match (did, genre) {
        (Some(did), None) => {
            let mut stmt = conn.prepare(
                r#"
            SELECT
                date_trunc('day', created_at) AS date,
                COUNT(DISTINCT scrobbles.created_at) AS count
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
        (None, Some(genre)) => {
            let mut stmt = conn.prepare(
                r#"
            SELECT
                date_trunc('day', created_at) AS date,
                COUNT(DISTINCT s.created_at) AS count
            FROM
                scrobbles s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN artists a ON s.artist_id = a.id
            WHERE list_contains(a.genres, ?) AND created_at BETWEEN ? AND ?
            GROUP BY
                date_trunc('day', created_at)
            ORDER BY
                date;
            "#,
            )?;
            let scrobbles = stmt.query_map([&genre, &start, &end], |row| {
                Ok(ScrobblesPerDay {
                    date: row.get(0)?,
                    count: row.get(1)?,
                })
            })?;
            let scrobbles: Result<Vec<_>, _> = scrobbles.collect();
            Ok(HttpResponse::Ok().json(scrobbles?))
        }
        _ => {
            let mut stmt = conn.prepare(
                r#"
            SELECT
              date_trunc('day', s.created_at) AS date,
                COUNT(DISTINCT (u.did, s.created_at)) AS count
            FROM scrobbles s
            JOIN users u ON u.id = s.user_id
            WHERE s.created_at BETWEEN ? AND ?
            GROUP BY 1
            ORDER BY 1;
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
    tracing::info!(start = %start, end = %end, user_did = ?did, "Get scrobbles per month");

    let conn = conn.lock().unwrap();
    match did {
        Some(did) => {
            let mut stmt = conn.prepare(
                r#"
            SELECT
                EXTRACT(YEAR FROM created_at) || '-' ||
                LPAD(EXTRACT(MONTH FROM created_at)::VARCHAR, 2, '0') AS year_month,
                COUNT(DISTINCT scrobbles.created_at) AS count
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
                COUNT(DISTINCT scrobbles.created_at) AS count
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
    tracing::info!(start = %start, end = %end, user_did = ?did, "Get scrobbles per year");

    let conn = conn.lock().unwrap();
    match did {
        Some(did) => {
            let mut stmt = conn.prepare(
                r#"
            SELECT
                EXTRACT(YEAR FROM created_at) AS year,
                COUNT(DISTINCT scrobbles.created_at) AS count
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
                COUNT(DISTINCT scrobbles.created_at) AS count
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
    tracing::info!(album_id = %params.album_id, start = %start, end = %end, "Get album scrobbles");

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
    tracing::info!(artist_id = %params.artist_id, start = %start, end = %end, "Get artist scrobbles");

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
    tracing::info!(track_id = %params.track_id, start = %start, end = %end, "Get track scrobbles");

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

pub async fn get_neighbours(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetNeighboursParams>(&body)?;
    let conn = conn.lock().unwrap();
    tracing::info!(user_id = %params.user_id, "Get neighbours");

    let mut stmt = conn.prepare(
        r#"
        WITH user_top_artists AS (
              SELECT
                  user_id,
                  artist_id,
                  COUNT(*) as play_count,
                  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY COUNT(*) DESC) as artist_rank
              FROM scrobbles s
              INNER JOIN artists a ON a.id = s.artist_id
              WHERE s.artist_id IS NOT NULL
                  AND a.name != 'Various Artists'
              GROUP BY user_id, artist_id
          ),
          weighted_similarity AS (
              SELECT
                  u1.user_id as target_user,
                  u2.user_id as neighbor_user,
                  SUM(1.0 / (u1.artist_rank + u2.artist_rank)) as similarity_score,
                  COUNT(DISTINCT u1.artist_id) as shared_artists,
                  ARRAY_AGG(DISTINCT u1.artist_id) FILTER (WHERE u1.artist_rank <= 20) as top_shared_artists
              FROM user_top_artists u1
              JOIN user_top_artists u2
                  ON u1.artist_id = u2.artist_id
                  AND u1.user_id != u2.user_id
              WHERE u1.user_id = ?
                  AND u1.artist_rank <= 50
                  AND u2.artist_rank <= 50
              GROUP BY u1.user_id, u2.user_id
              HAVING shared_artists >= 3
                  AND top_shared_artists IS NOT NULL
          )
          SELECT
              ws.neighbor_user,
              u.display_name,
              u.handle,
              u.did,
              u.avatar,
              ws.similarity_score,
              ws.shared_artists,
              to_json(LIST(a.name ORDER BY array_position(ws.top_shared_artists, a.id))) as top_shared_artist_names,
              to_json(LIST({'id': a.id, 'name': a.name, 'picture': a.picture, 'uri': a.uri}
                   ORDER BY array_position(ws.top_shared_artists, a.id))) as top_shared_artists_details
          FROM weighted_similarity ws
          LEFT JOIN users u ON u.id = ws.neighbor_user
          INNER JOIN UNNEST(ws.top_shared_artists) AS t(artist_id) ON true
          INNER JOIN artists a ON a.id = t.artist_id
          GROUP BY ws.neighbor_user, u.display_name, u.handle, u.did, u.avatar, ws.similarity_score, ws.shared_artists, ws.top_shared_artists
          ORDER BY ws.similarity_score DESC
          LIMIT 20
        "#,
    )?;

    let neighbours = stmt.query_map([&params.user_id], |row| {
        let top_shared_artist_names_json: String = row.get(7)?;
        let top_shared_artists_details_json: String = row.get(8)?;

        let top_shared_artist_names: Vec<String> =
            serde_json::from_str(&top_shared_artist_names_json).unwrap_or_else(|_| Vec::new());
        let top_shared_artists_details: Vec<crate::types::stats::NeighbourArtist> =
            serde_json::from_str(&top_shared_artists_details_json).unwrap_or_else(|_| Vec::new());

        Ok(Neighbour {
            user_id: row.get(0)?,
            display_name: row.get(1)?,
            handle: row.get(2)?,
            did: row.get(3)?,
            avatar: row.get(4)?,
            similarity_score: row.get(5)?,
            shared_artists_count: row.get(6)?,
            top_shared_artist_names,
            top_shared_artists_details,
        })
    })?;

    let neighbours: Result<Vec<_>, _> = neighbours.collect();
    Ok(HttpResponse::Ok().json(neighbours?))
}

pub async fn get_compatibility(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    conn: Arc<Mutex<Connection>>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<GetCompatibilityParams>(&body)?;
    let conn = conn.lock().unwrap();
    tracing::info!(user_id_1 = %params.user_id1, user_id_2 = %params.user_id2, "Get compatibility");

    let mut stmt = conn.prepare(
        r#"
        WITH user_top_artists AS (
            SELECT
                user_id,
                artist_id,
                COUNT(*) as play_count,
                ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY COUNT(*) DESC) as artist_rank
            FROM scrobbles s
            INNER JOIN artists a ON a.id = s.artist_id
            WHERE s.artist_id IS NOT NULL
                AND a.name != 'Various Artists'
                AND user_id IN (?, ?)
            GROUP BY user_id, artist_id
        ),
        user_totals AS (
            SELECT
                user_id,
                COUNT(DISTINCT artist_id) as total_artists
            FROM user_top_artists
            WHERE artist_rank <= 50
            GROUP BY user_id
        ),
        shared_weighted AS (
            SELECT
                u1.artist_id,
                u1.artist_rank as user1_rank,
                u2.artist_rank as user2_rank,
                (1.0 / u1.artist_rank) * (1.0 / u2.artist_rank) as artist_weight,
                ROW_NUMBER() OVER (ORDER BY (1.0 / u1.artist_rank) * (1.0 / u2.artist_rank) DESC) as weight_rank
            FROM user_top_artists u1
            INNER JOIN user_top_artists u2
                ON u1.artist_id = u2.artist_id
                AND u1.user_id = ?
                AND u2.user_id = ?
            WHERE u1.artist_rank <= 50
                AND u2.artist_rank <= 50
        ),
        compatibility_calc AS (
            SELECT
                SUM(sw.artist_weight) as weighted_overlap,
                COUNT(*) as shared_count,
                (SELECT total_artists FROM user_totals WHERE user_id = ?) as user1_total,
                (SELECT total_artists FROM user_totals WHERE user_id = ?) as user2_total
            FROM shared_weighted sw
        )
        SELECT
            ROUND(
                (shared_count * 1.0 / LEAST(user1_total, user2_total)) * 100,
                1
            ) as compatibility_percentage,
            CASE
                WHEN (shared_count * 1.0 / LEAST(user1_total, user2_total)) * 100 < 20 THEN 'Low'
                WHEN (shared_count * 1.0 / LEAST(user1_total, user2_total)) * 100 < 40 THEN 'Medium'
                WHEN (shared_count * 1.0 / LEAST(user1_total, user2_total)) * 100 < 60 THEN 'High'
                WHEN (shared_count * 1.0 / LEAST(user1_total, user2_total)) * 100 < 75 THEN 'Very High'
                WHEN (shared_count * 1.0 / LEAST(user1_total, user2_total)) * 100 < 90 THEN 'Super'
                ELSE 'ZOMG!1!'
            END as compatibility_level,
            shared_count as shared_artists,
            user1_total as user1_artist_count,
            user2_total as user2_artist_count,
            to_json(LIST(a.name ORDER BY sw.artist_weight DESC) FILTER (WHERE sw.weight_rank <= 10)) as top_shared_artists,
            to_json(LIST({
                'id': a.id,
                'name': a.name,
                'picture': a.picture,
                'uri': a.uri,
                'user1_rank': sw.user1_rank,
                'user2_rank': sw.user2_rank,
                'weight': sw.artist_weight
            } ORDER BY sw.artist_weight DESC) FILTER (WHERE sw.weight_rank <= 10)) as top_shared_detailed_artists
        FROM compatibility_calc
        CROSS JOIN shared_weighted sw
        INNER JOIN artists a ON a.id = sw.artist_id
        GROUP BY weighted_overlap, shared_count, user1_total, user2_total;
        "#,
    )?;

    let compatibility = stmt.query_map(
        [
            &params.user_id1,
            &params.user_id2,
            &params.user_id1,
            &params.user_id2,
            &params.user_id1,
            &params.user_id2,
        ],
        |row| {
            let top_shared_artists_json: String = row.get(5)?;
            let top_shared_artists: Vec<String> =
                serde_json::from_str(&top_shared_artists_json).unwrap_or_else(|_| Vec::new());
            let top_shared_detailed_artists_json: String = row.get(6)?;
            let top_shared_detailed_artists: Vec<SharedArtist> =
                serde_json::from_str(&top_shared_detailed_artists_json)
                    .unwrap_or_else(|_| Vec::new());
            Ok(Compatibility {
                compatibility_percentage: row.get(0)?,
                compatibility_level: row.get(1)?,
                shared_artists: row.get(2)?,
                user1_artist_count: row.get(3)?,
                user2_artist_count: row.get(4)?,
                top_shared_artists,
                top_shared_detailed_artists,
            })
        },
    )?;

    let compatibility = compatibility.collect::<Result<Vec<_>, _>>()?;
    let compatibility = compatibility.into_iter().next();

    Ok(HttpResponse::Ok().json(compatibility))
}
