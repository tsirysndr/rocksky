use core::{create_tables, find_spotify_users, load_users, save_playlists};
use std::env;

use anyhow::Error;
use dotenv::dotenv;
use duckdb::Connection;
use spotify::get_user_playlists;
use sqlx::postgres::PgPoolOptions;

pub mod types;
pub mod crypto;
pub mod xata;
pub mod core;
pub mod spotify;

#[tokio::main]
async fn main() -> Result<(), Error> {
    dotenv().ok();

    let conn = Connection::open("./rocksky-playlists.ddb")?;
    create_tables(&conn)?;

    let pool = PgPoolOptions::new().max_connections(5).connect(&env::var("XATA_POSTGRES_URL")?).await?;
    let users = find_spotify_users(&pool, 0, 100).await?;

    load_users(&conn, &pool).await?;

    sqlx::query(r#"
      CREATE UNIQUE INDEX IF NOT EXISTS user_playlists_unique_index ON user_playlists (user_id, playlist_id)
    "#)
      .execute(&pool)
      .await?;

    for user in users {
      let token = user.1.clone();
      let user_id = user.3.clone();
      let playlists = get_user_playlists(token).await?;
      save_playlists(&pool, &conn, playlists, &user_id).await?;
    }

    println!("Done!");

    conn.close()
      .map_err(|(_, e)| Error::new(e))?;

    Ok(())
}

