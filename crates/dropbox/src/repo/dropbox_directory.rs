use sqlx::{Pool, Postgres};
use crate::{types::file::Entry, xata::dropbox_diretory::DropboxDirectory};

pub async fn create_dropbox_directory(
    pool: &Pool<Postgres>,
    file: &Entry,
    dropbox_id: &str,
    parent_dir: &str,
) -> Result<(), sqlx::Error> {
   let results: Vec<DropboxDirectory> = sqlx::query_as(
      r#"
      SELECT *
      FROM dropbox_directory
      WHERE dropbox_id = $1
        AND path = $2
      LIMIT 1
      "#,
    )
    .bind(dropbox_id)
    .bind(parent_dir)
    .fetch_all(pool)
    .await?;

  let parent_id = results.first().map(|d| d.xata_id.clone());

  sqlx::query(
      r#"
      INSERT INTO dropbox_directory (
          dropbox_id,
          name,
          path,
          file_id,
          parent_id
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
      "#,
    )
    .bind(dropbox_id)
    .bind(&file.name)
    .bind(&file.path_display)
    .bind(&file.id)
    .bind(parent_id)
    .execute(pool)
    .await?;

  Ok(())
}