use std::sync::Arc;

use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct UserRepo {
    pub pool: Arc<Mutex<Pool<Postgres>>>,
}

impl UserRepo {
    pub fn new(pool: Arc<Mutex<Pool<Postgres>>>) -> Self {
        Self { pool }
    }

    pub async fn save_user(&self, _did: &str) -> Result<(), anyhow::Error> {
        todo!()
    }
}
