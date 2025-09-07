use std::{
    env,
    sync::{Arc, Mutex},
};

use anyhow::Error;
use duckdb::Connection;
use sqlx::postgres::PgPoolOptions;

use crate::core::create_tables;

pub mod cmd;
pub mod core;
pub mod handlers;
pub mod subscriber;
pub mod types;
pub mod xata;

pub async fn serve() -> Result<(), Error> {
    let conn = Connection::open("./rocksky-analytics.ddb")?;

    create_tables(&conn).await?;

    let conn = Arc::new(Mutex::new(conn));
    cmd::serve::serve(conn).await?;

    Ok(())
}

pub async fn sync() -> Result<(), Error> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let conn = Connection::open("./rocksky-analytics.ddb")?;
    create_tables(&conn).await?;

    let conn = Arc::new(Mutex::new(conn));

    cmd::sync::sync(conn, &pool).await?;

    Ok(())
}
