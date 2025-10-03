use std::sync::Arc;

use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;

use crate::types::AlbumRecord;

#[derive(Clone)]
pub struct AlbumRepo {
    pub pool: Arc<Mutex<Pool<Postgres>>>,
}

impl AlbumRepo {
    pub fn new(pool: Arc<Mutex<Pool<Postgres>>>) -> Self {
        Self { pool }
    }

    pub async fn save_album(&self, _uri: &str, _record: AlbumRecord) -> Result<(), anyhow::Error> {
        todo!()
    }

    pub async fn get_albums(&self) -> Result<Vec<AlbumRecord>, anyhow::Error> {
        todo!()
    }
}
