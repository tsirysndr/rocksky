use std::sync::{Arc, Mutex};

pub fn save_user(_conn: Arc<Mutex<duckdb::Connection>>, _did: &str) -> Result<(), anyhow::Error> {
    todo!()
}
