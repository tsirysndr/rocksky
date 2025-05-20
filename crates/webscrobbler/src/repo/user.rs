use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::user::User;


pub async fn get_user_by_webscrobbler(pool: &Pool<Postgres>, uuid: &str) -> Result<Option<User>, Error> {
  let results: Vec<User> = sqlx::query_as(r#"
    SELECT * FROM users
    LEFT JOIN webscrobblers ON users.xata_id = webscrobblers.user_id
    WHERE webscrobblers.uuid = $1
  "#)
  .bind(uuid)
  .fetch_all(pool)
  .await?;

  if results.len() == 0 {
    return Ok(None);
  }

  Ok(Some(results[0].clone()))
}
