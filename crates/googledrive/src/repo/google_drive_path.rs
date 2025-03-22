use sqlx::{Pool, Postgres};

use crate::{types::file::File, xata::track::Track};

pub async fn create_google_drive_path(
  pool: &Pool<Postgres>,
  file: &File,
  track: &Track,
  google_drive_id: &str
) -> Result<(), sqlx::Error> {
  sqlx::query(r#"
    INSERT INTO google_drive_paths (google_drive_id, file_id, track_id, name)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (google_drive_id, file_id, track_id) DO NOTHING
  "#)
    .bind(google_drive_id)
    .bind(&file.id)
    .bind(&track.xata_id)
    .bind(&file.name)
    .execute(pool)
    .await?;

  Ok(())
}