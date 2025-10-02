use std::sync::Arc;

use tokio::sync::Mutex;

pub struct UserRepo {
    pub conn: Arc<Mutex<duckdb::Connection>>,
}

impl UserRepo {
    pub fn new(conn: Arc<Mutex<duckdb::Connection>>) -> Self {
        Self { conn }
    }
}
