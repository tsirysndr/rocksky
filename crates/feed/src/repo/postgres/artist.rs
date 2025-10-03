use std::sync::Arc;

use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;

use crate::{types::ArtistRecord, xata::artist::Artist};

#[derive(Clone)]
pub struct ArtistRepo {
    pub pool: Arc<Mutex<Pool<Postgres>>>,
}

impl ArtistRepo {
    pub fn new(pool: Arc<Mutex<Pool<Postgres>>>) -> Self {
        Self { pool }
    }

    pub async fn save_artist(
        &self,
        _uri: &str,
        _record: ArtistRecord,
    ) -> Result<(), anyhow::Error> {
        todo!()
    }

    pub async fn get_artists(&self) -> Result<Vec<Artist>, anyhow::Error> {
        todo!()
    }
}
