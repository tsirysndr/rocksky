use anyhow::Error;
use serde_json::{Value, json};

pub async fn get_listen_count(_user_name: &str) -> Result<Value, Error> {
    let count = json!({
      "payload": {
        "count": 407,
      }
    });

    Ok(count)
}
