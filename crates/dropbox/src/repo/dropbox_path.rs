use sqlx::{Pool, Postgres};

use crate::xata::track::Track;
use crate::types::file::Entry;

pub async fn create_dropbox_path(
  pool: &Pool<Postgres>,
  file: &Entry,
  track: &Track,
  dropbox_id: &str
) -> Result<(), sqlx::Error> {
  sqlx::query(r#"
    INSERT INTO dropbox_paths (dropbox_id, path, file_id, track_id, name)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT DO NOTHING
  "#)
    .bind(dropbox_id)
    .bind(&file.path_display)
    .bind(&file.id)
    .bind(&track.xata_id)
    .bind(&file.name)
    .execute(pool)
    .await?;

  Ok(())
}