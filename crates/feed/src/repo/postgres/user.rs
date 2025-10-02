use std::sync::Arc;

use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;

pub struct UserRepo {
    pub pool: Arc<Mutex<Pool<Postgres>>>,
}

impl UserRepo {
    pub fn new(pool: Arc<Mutex<Pool<Postgres>>>) -> Self {
        Self { pool }
    }
}
