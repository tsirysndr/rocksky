use std::sync::{Arc, Mutex};

use anyhow::Error;
use duckdb::Connection;
use sqlx::{Pool, Postgres};
use crate::core::*;

pub async fn sync(conn: Arc<Mutex<Connection>>, pool: &Pool<Postgres>) -> Result<(), Error> {
    load_tracks(conn.clone(), pool).await?;
    load_artists(conn.clone(), pool).await?;
    load_albums(conn.clone(), pool).await?;
    load_users(conn.clone(), pool).await?;
    load_scrobbles(conn.clone(), pool).await?;
    load_album_tracks(conn.clone(), pool).await?;
    load_loved_tracks(conn.clone(), pool).await?;
    load_artist_tracks(conn.clone(), pool).await?;
    load_artist_albums(conn.clone(), pool).await?;
    load_user_albums(conn.clone(), pool).await?;
    load_user_artists(conn.clone(), pool).await?;
    load_user_tracks(conn.clone(), pool).await?;

    Ok(())
}
