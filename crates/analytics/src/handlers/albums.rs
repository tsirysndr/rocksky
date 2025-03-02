use std::sync::{Arc, Mutex};

use actix_web::{web, HttpRequest, HttpResponse};
use analytics::types::album::{Album, GetAlbumsParams, GetTopAlbumsParams};
use duckdb::Connection;
use anyhow::Error;
use futures_util::StreamExt;

use crate::read_payload;

pub async fn get_albums(payload: &mut web::Payload, _req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<GetAlbumsParams>(&body)?;
  let pagination = params.pagination.unwrap_or_default();
  let offset = pagination.skip.unwrap_or(0);
  let limit = pagination.take.unwrap_or(20);
  let did = params.user_did;

  let conn = conn.lock().unwrap();
  let mut stmt = match did {
    Some(_) => {
      conn.prepare(r#"
        SELECT a.* FROM user_albums ua
        LEFT JOIN albums a ON ua.album_id = a.id
        LEFT JOIN users u ON ua.user_id = u.id
        WHERE u.did = ?
        ORDER BY a.title ASC OFFSET ? LIMIT ?;
      "#)?
    },
    None => {
      conn.prepare("SELECT * FROM albums ORDER BY title ASC OFFSET ? LIMIT ?")?
    }
  };

  match did {
    Some(did) => {
      let albums_iter = stmt.query_map([did, limit.to_string(), offset.to_string()], |row| {
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
          ..Default::default()
        })
      })?;

      let albums: Result<Vec<_>, _> = albums_iter.collect();
      Ok(HttpResponse::Ok().json(web::Json(albums?)))
    },
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
          ..Default::default()
        })
        })?;

      let albums: Result<Vec<_>, _> = albums_iter.collect();
      Ok(HttpResponse::Ok().json(web::Json(albums?)))
    }
  }
}


pub async fn get_top_albums(payload: &mut web::Payload, _req: &HttpRequest, conn: Arc<Mutex<Connection>>) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<GetTopAlbumsParams>(&body)?;
  let pagination = params.pagination.unwrap_or_default();
  let offset = pagination.skip.unwrap_or(0);
  let limit = pagination.take.unwrap_or(20);
  let did = params.user_did;

  let conn = conn.lock().unwrap();
  let mut stmt = match did {
    Some(_) => conn.prepare(r#"
      SELECT
          s.album_id AS id,
          a.title AS title,
          ar.name AS artist,
          a.album_art AS album_art,
          a.release_date,
          a.year,
          a.uri AS uri,
          COUNT(*) AS play_count,
          COUNT(DISTINCT s.user_id) AS unique_listeners
      FROM
          scrobbles s
      LEFT JOIN
          albums a ON s.album_id = a.id
      LEFT JOIN
          artists ar ON a.artist_uri = ar.uri
      LEFT JOIN
          users u ON s.user_id = u.id
      WHERE s.album_id IS NOT NULL AND u.did = ?
      GROUP BY
          s.album_id, a.title, ar.name, a.release_date, a.year, a.uri, a.album_art
      ORDER BY
          play_count DESC
      OFFSET ?
      LIMIT ?;
  "#)?,
  None => conn.prepare(r#"
      SELECT
          s.album_id AS id,
          a.title AS title,
          ar.name AS artist,
          a.album_art AS album_art,
          a.release_date,
          a.year,
          a.uri AS uri,
          COUNT(*) AS play_count,
          COUNT(DISTINCT s.user_id) AS unique_listeners
      FROM
          scrobbles s
      LEFT JOIN
          albums a ON s.album_id = a.id
      LEFT JOIN
          artists ar ON a.artist_uri = ar.uri WHERE s.album_id IS NOT NULL
      GROUP BY
          s.album_id, a.title, ar.name, a.release_date, a.year, a.uri, a.album_art
      ORDER BY
          play_count DESC
      OFFSET ?
      LIMIT ?;
    "#)?
  };

  match did {
    Some(did) => {
      let albums = stmt.query_map([did, limit.to_string(), offset.to_string()], |row| {
        Ok(Album {
          id: row.get(0)?,
          title: row.get(1)?,
          artist: row.get(2)?,
          album_art: row.get(3)?,
          release_date: row.get(4)?,
          year: row.get(5)?,
          uri: row.get(6)?,
          play_count: Some(row.get(7)?),
          unique_listeners: Some(row.get(8)?),
          ..Default::default()
        })
      })?;
      let albums: Result<Vec<_>, _> = albums.collect();
      Ok(HttpResponse::Ok().json(web::Json(albums?)))
    },
    None => {
      let albums = stmt.query_map([limit, offset], |row| {
        Ok(Album {
          id: row.get(0)?,
          title: row.get(1)?,
          artist: row.get(2)?,
          album_art: row.get(3)?,
          release_date: row.get(4)?,
          year: row.get(5)?,
          uri: row.get(6)?,
          play_count: Some(row.get(7)?),
          unique_listeners: Some(row.get(8)?),
          ..Default::default()
        })
      })?;
      let albums: Result<Vec<_>, _> = albums.collect();
      Ok(HttpResponse::Ok().json(web::Json(albums?)))
    }
  }
}