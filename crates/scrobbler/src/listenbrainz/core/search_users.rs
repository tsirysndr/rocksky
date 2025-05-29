use anyhow::Error;
use serde_json::{json, Value};

pub async fn search_users(_query: &str) -> Result<Value, Error> {
    let results = json!({});
    Ok(results)
}
