use crate::xata::webscrobbler::Webscrobbler;
use anyhow::Error;
use sqlx::{Pool, Postgres};

pub async fn get_webscrobbler(
    pool: &Pool<Postgres>,
    uuid: &str,
) -> Result<Option<Webscrobbler>, Error> {
    let results: Vec<Webscrobbler> = sqlx::query_as(
        r#"
    SELECT * FROM webscrobblers
    WHERE uuid = $1
  "#,
    )
    .bind(uuid)
    .fetch_all(pool)
    .await?;

    if results.len() == 0 {
        return Ok(None);
    }

    Ok(Some(results[0].clone()))
}
