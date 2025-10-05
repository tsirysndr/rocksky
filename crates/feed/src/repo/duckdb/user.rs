use std::sync::{Arc, Mutex};

use crate::r2d2_duckdb::DuckDBConnectionManager;

pub async fn save_user(
    _pool: r2d2::Pool<DuckDBConnectionManager>,
    _mutex: Arc<Mutex<()>>,
    _did: &str,
) -> Result<(), anyhow::Error> {
    todo!()
}
