use std::sync::Arc;

use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;

use crate::types::SongRecord;

#[derive(Clone)]
pub struct TrackRepo {
    pub pool: Arc<Mutex<Pool<Postgres>>>,
}

impl TrackRepo {
    pub fn new(pool: Arc<Mutex<Pool<Postgres>>>) -> Self {
        Self { pool }
    }

    pub async fn save_track(&self, _uri: &str, _record: SongRecord) -> Result<(), anyhow::Error> {
        todo!()
    }
}
