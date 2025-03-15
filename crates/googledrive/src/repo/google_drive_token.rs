use sqlx::{Pool, Postgres};
use anyhow::Error;

use crate::xata::google_drive_token::GoogleDriveTokenWithDid;

pub async fn find_google_drive_refresh_token(pool: &Pool<Postgres>, did: &str) -> Result<Option<String>, Error> {
  let results: Vec<GoogleDriveTokenWithDid> = sqlx::query_as(r#"
    SELECT * FROM google_drive gd
    LEFT JOIN users u ON gd.user_id = u.xata_id
    LEFT JOIN google_drive_tokens gt ON gd.google_drive_token_id = gt.xata_id
    WHERE u.did = $1
  "#)
    .bind(did)
    .fetch_all(pool)
    .await?;

  if results.len() == 0 {
    return Ok(None);
  }

 Ok(Some(results[0].refresh_token.clone()))
}
