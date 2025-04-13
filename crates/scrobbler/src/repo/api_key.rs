use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::api_key::ApiKey;


pub async fn get_apikey(pool: &Pool<Postgres>, apikey: &str, did: &str) -> Result<Option<ApiKey>, Error> {
  let results: Vec<ApiKey> = sqlx::query_as(r#"
    SELECT * FROM api_keys
    LEFT JOIN users ON api_keys.user_id = users.xata_id
    WHERE api_keys.api_key = $1 AND users.did = $2
  "#)
  .bind(apikey)
  .bind(did)
  .fetch_all(pool)
  .await?;

  if results.len() == 0 {
    return Ok(None);
  }

  Ok(Some(results[0].clone()))
}
