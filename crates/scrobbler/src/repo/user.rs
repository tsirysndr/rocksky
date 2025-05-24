use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::user::User;


pub async fn get_user_by_apikey(pool: &Pool<Postgres>, apikey: &str) -> Result<Option<User>, Error> {
  let results: Vec<User> = sqlx::query_as(r#"
    SELECT * FROM users
    LEFT JOIN api_keys ON users.xata_id = api_keys.user_id
    WHERE api_keys.api_key = $1
  "#)
  .bind(apikey)
  .fetch_all(pool)
  .await?;

  if results.is_empty(){
    return Ok(None);
  }

  Ok(Some(results[0].clone()))
}


pub async fn get_user_by_did(pool: &Pool<Postgres>, did: &str) -> Result<Option<User>, Error> {
  let results: Vec<User> = sqlx::query_as(r#"
    SELECT * FROM users
    WHERE did = $1
  "#)
  .bind(did)
  .fetch_all(pool)
  .await?;

  if results.is_empty() {
    return Ok(None);
  }

  Ok(Some(results[0].clone()))
}