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
pub mod types;

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
    pub scrobbles: Arc<Mutex<Vec<Scrobble>>>,
}

impl FeedHandler for RecentlyPlayedFeedHandler {
    async fn insert_scrobble(&self, scrobble: Scrobble) {
        todo!()
    }

    async fn delete_scrobble(&self, uri: types::Uri) {
        todo!()
    }

    async fn serve_feed(&self, request: types::Request) -> FeedResult {
        todo!()
    }
}

pub async fn run() {
    let mut feed = RecentlyPlayedFeed {
        handler: RecentlyPlayedFeedHandler {
            scrobbles: Arc::new(Mutex::new(Vec::new())),
        },
    };
    let host = env::var("FEED_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("FEED_PORT").unwrap_or_else(|_| "7885".to_string());
    let addr_str = format!("{}:{}", host, port);
    let addr: SocketAddr = addr_str.parse().expect("Invalid address format");

    feed.start("recently-played", addr).await;
}
