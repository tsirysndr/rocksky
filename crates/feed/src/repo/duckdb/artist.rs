use std::sync::Arc;

use tokio::sync::Mutex;

pub struct ArtistRepo {
    pub conn: Arc<Mutex<duckdb::Connection>>,
}

impl ArtistRepo {
    pub fn new(conn: Arc<Mutex<duckdb::Connection>>) -> Self {
        Self { conn }
    }
}
