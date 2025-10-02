use std::sync::Arc;

use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;

pub struct AlbumRepo {
    pub pool: Arc<Mutex<Pool<Postgres>>>,
}

impl AlbumRepo {
    pub fn new(pool: Arc<Mutex<Pool<Postgres>>>) -> Self {
        Self { pool }
    }
}
