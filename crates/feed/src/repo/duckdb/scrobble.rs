use std::sync::Arc;

use tokio::sync::Mutex;

pub struct ScrobbleRepo {
    pub conn: Arc<Mutex<duckdb::Connection>>,
}

impl ScrobbleRepo {
    pub fn new(conn: Arc<Mutex<duckdb::Connection>>) -> Self {
        Self { conn }
    }
}
