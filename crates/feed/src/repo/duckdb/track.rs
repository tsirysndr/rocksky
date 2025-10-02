use std::sync::Arc;

use tokio::sync::Mutex;

pub struct TrackRepo {
    pub conn: Arc<Mutex<duckdb::Connection>>,
}

impl TrackRepo {
    pub fn new(conn: Arc<Mutex<duckdb::Connection>>) -> Self {
        Self { conn }
    }
}
