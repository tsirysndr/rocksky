
use anyhow::Error;
use serde_json::{json, Value};

pub async fn get_listens(_user_name: &str) -> Result<Value, Error> {
    let listens = json!({
      "payload": {
        "count": 25,
        "latest_listen_ts": 1748276948,
        "listens": vec![
          json!({})
        ],
        "oldest_listen_ts": 1747917399,
        "user_id": "tsiry"
      }
    });
    Ok(listens)
}