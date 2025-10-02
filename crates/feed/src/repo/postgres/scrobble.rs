use std::sync::Arc;

use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;

pub struct ScrobbleRepo {
    pub pool: Arc<Mutex<Pool<Postgres>>>,
}

impl ScrobbleRepo {
    pub fn new(pool: Arc<Mutex<Pool<Postgres>>>) -> Self {
        Self { pool }
    }
}
