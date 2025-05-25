use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::dropbox_token::DropboxTokenWithDid;

pub async fn find_dropbox_refresh_token(
    pool: &Pool<Postgres>,
    did: &str,
) -> Result<Option<(String, String)>, Error> {
    let results: Vec<DropboxTokenWithDid> = sqlx::query_as(
        r#"
    SELECT
      d.xata_id,
      d.xata_version,
      d.xata_createdat,
      d.xata_updatedat,
      u.did as did,
      dt.refresh_token as refresh_token
    FROM dropbox d
    LEFT JOIN users u ON d.user_id = u.xata_id
    LEFT JOIN dropbox_tokens dt ON d.dropbox_token_id = dt.xata_id
    WHERE u.did = $1
  "#,
    )
    .bind(did)
    .fetch_all(pool)
    .await?;

    if results.len() == 0 {
        return Ok(None);
    }

    Ok(Some((
        results[0].refresh_token.clone(),
        results[0].xata_id.clone(),
    )))
}

pub async fn find_dropbox_refresh_tokens(
    pool: &Pool<Postgres>,
) -> Result<Vec<DropboxTokenWithDid>, Error> {
    let results: Vec<DropboxTokenWithDid> = sqlx::query_as(
        r#"
    SELECT
      d.xata_id,
      d.xata_version,
      d.xata_createdat,
      d.xata_updatedat,
      u.did,
      dt.refresh_token as refresh_token
    FROM dropbox d
    LEFT JOIN users u ON d.user_id = u.xata_id
    LEFT JOIN dropbox_tokens dt ON d.dropbox_token_id = dt.xata_id
  "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(results)
}
