use anyhow::Error;
use serde_json::{Value, json};

pub async fn search_users(_query: &str) -> Result<Value, Error> {
    let results = json!({});
    Ok(results)
}
