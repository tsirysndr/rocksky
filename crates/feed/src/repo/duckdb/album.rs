use std::sync::Arc;

use tokio::sync::Mutex;

pub struct AlbumRepo {
    pub conn: Arc<Mutex<duckdb::Connection>>,
}

impl AlbumRepo {
    pub fn new(conn: Arc<Mutex<duckdb::Connection>>) -> Self {
        Self { conn }
    }
}
