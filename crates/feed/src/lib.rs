use anyhow::Error;
use duckdb::Connection;
use sqlx::{postgres::PgPoolOptions, Pool, Postgres};
use std::{env, net::SocketAddr, sync::Arc};
use tokio::sync::Mutex;

use crate::{
    feed::Feed,
    feed_handler::FeedHandler,
    types::{FeedResult, Scrobble},
};

pub mod config;
pub mod feed;
pub mod feed_handler;
pub mod feeds;
pub mod repo;
pub mod subscriber;
pub mod types;
pub mod xata;

pub struct RecentlyPlayedFeed {
    handler: RecentlyPlayedFeedHandler,
}

impl Feed<RecentlyPlayedFeedHandler> for RecentlyPlayedFeed {
    fn handler(&mut self) -> RecentlyPlayedFeedHandler {
        self.handler.clone()
    }
}

#[derive(Clone)]
pub struct RecentlyPlayedFeedHandler {
    pub conn: Arc<Mutex<Connection>>,
    pub pool: Arc<Mutex<Pool<Postgres>>>,
}

impl FeedHandler for RecentlyPlayedFeedHandler {
    async fn insert_scrobble(&self, _scrobble: Scrobble) {
        todo!()
    }

    async fn delete_scrobble(&self, _uri: types::Uri) {
        todo!()
    }

    async fn serve_feed(&self, _request: types::Request) -> FeedResult {
        FeedResult {
            feed: vec![],
            cursor: None,
        }
    }
}

pub async fn run() -> Result<(), Error> {
    let conn = Connection::open("./rocksky-seed.ddb")?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let mut feed = RecentlyPlayedFeed {
        handler: RecentlyPlayedFeedHandler {
            conn: Arc::new(Mutex::new(conn)),
            pool: Arc::new(Mutex::new(pool)),
        },
    };
    let host = env::var("FEED_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("FEED_PORT").unwrap_or_else(|_| "7885".to_string());
    let addr_str = format!("{}:{}", host, port);
    let addr: SocketAddr = addr_str.parse().expect("Invalid address format");

    feed.start("RecentlyPlayed", addr).await?;
    Ok(())
}
