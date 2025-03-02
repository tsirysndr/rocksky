use core::create_tables;
use std::{env, sync::{Arc, Mutex}};

use clap::Command;
use cmd::{serve::serve, sync::sync};
use duckdb::Connection;
use sqlx::postgres::PgPoolOptions;
use dotenv::dotenv;

pub mod types;
pub mod xata;
pub mod cmd;
pub mod core;
pub mod handlers;
pub mod subscriber;

fn cli() -> Command {
    Command::new("analytics")
        .version(env!("CARGO_PKG_VERSION"))
        .about("Rocksky Analytics CLI built with Rust and DuckDB")
        .subcommand(
            Command::new("sync")
            .about("Sync data from Xata to DuckDB")
        )
        .subcommand(
            Command::new("serve")
            .about("Serve the Rocksky Analytics API")
        )
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();


    let pool=  PgPoolOptions::new().max_connections(5).connect(&env::var("XATA_POSTGRES_URL")?).await?;
    let conn = Connection::open("./rocksky-analytics.ddb")?;

    create_tables(&conn).await?;

    let args = cli().get_matches();
    let conn = Arc::new(Mutex::new(conn));

    match args.subcommand() {
        Some(("sync", _)) => sync(conn, &pool).await?,
        Some(("serve", _)) => serve(conn).await?,
        _ => serve(conn).await?,
    }

    Ok(())
}
