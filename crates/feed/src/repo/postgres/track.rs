use std::sync::Arc;

use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;

pub struct TrackRepo {
    pub pool: Arc<Mutex<Pool<Postgres>>>,
}

impl TrackRepo {
    pub fn new(pool: Arc<Mutex<Pool<Postgres>>>) -> Self {
        Self { pool }
    }
}
