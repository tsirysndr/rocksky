use std::sync::Arc;

use sqlx::{Pool, Postgres};
use tokio::sync::Mutex;

use crate::{types::ScrobbleRecord, xata::scrobble::Scrobble};

#[derive(Clone)]
pub struct ScrobbleRepo {
    pub pool: Arc<Mutex<Pool<Postgres>>>,
}

impl ScrobbleRepo {
    pub fn new(pool: Arc<Mutex<Pool<Postgres>>>) -> Self {
        Self { pool }
    }

    pub async fn save_scrobble(
        &self,
        _did: &str,
        _uri: &str,
        _record: ScrobbleRecord,
    ) -> Result<(), anyhow::Error> {
        todo!()
    }

    pub async fn get_scrobbles(&self) -> Result<Vec<Scrobble>, anyhow::Error> {
        todo!()
    }
}
