use anyhow::Error;
use duckdb::Connection;
use sqlx::{Pool, Postgres};
use crate::core::*;

pub async fn sync(conn: &Connection, pool: &Pool<Postgres>) -> Result<(), Error> {
    load_tracks(conn, pool).await?;
    load_artists(conn, pool).await?;
    load_albums(conn, pool).await?;
    load_users(conn, pool).await?;
    load_scrobbles(conn, pool).await?;
    load_album_tracks(conn, pool).await?;
    load_loved_tracks(conn, pool).await?;
    load_artist_tracks(conn, pool).await?;
    load_user_albums(conn, pool).await?;
    load_user_artists(conn, pool).await?;
    load_user_tracks(conn, pool).await?;

    Ok(())
}
