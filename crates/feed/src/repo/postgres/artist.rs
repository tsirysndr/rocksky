use std::sync::Arc;

use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;

pub struct ArtistRepo {
    pub pool: Arc<Mutex<Pool<Postgres>>>,
}

impl ArtistRepo {
    pub fn new(pool: Arc<Mutex<Pool<Postgres>>>) -> Self {
        Self { pool }
    }
}
