use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::track::Track;

pub async fn get_track_by_hash(pool: &Pool<Postgres>, sha256: &str) -> Result<Option<Track>, Error> {
  let results: Vec<Track> = sqlx::query_as(r#"
    SELECT * FROM tracks WHERE sha256 = $1
    "#)
    .bind(sha256)
    .fetch_all(pool)
    .await?;

  if results.len() == 0 {
    return Ok(None);
  }

  Ok(Some(results[0].clone()))
}