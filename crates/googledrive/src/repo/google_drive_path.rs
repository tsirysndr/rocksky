use sqlx::{Pool, Postgres};

use crate::{types::file::File, xata::{google_drive_directory::GoogleDriveDirectory, track::Track}};

pub async fn create_google_drive_path(
    pool: &Pool<Postgres>,
    file: &File,
    track: &Track,
    google_drive_id: &str,
    parent_dir: &str,
) -> Result<(), sqlx::Error> {
    let parent_dir: Vec<GoogleDriveDirectory> = sqlx::query_as(
        r#"
        SELECT *
        FROM google_drive_directories
        WHERE google_drive_id = $1
          AND file_id = $2
        LIMIT 1
        "#,
    )
    .bind(google_drive_id)
    .bind(parent_dir)
    .fetch_all(pool)
    .await?;

    let parent_dir = parent_dir.first().map(|d| d.clone().xata_id);

    let result = sqlx::query(
        r#"
    INSERT INTO google_drive_paths (google_drive_id, file_id, track_id, name, directory_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT DO NOTHING
  "#,
    )
    .bind(google_drive_id)
    .bind(&file.id)
    .bind(&track.xata_id)
    .bind(&file.name)
    .bind(&parent_dir)
    .execute(pool)
    .await?;

    println!("{:?}", result);

    sqlx::query(
        r#"
        UPDATE google_drive_paths
        SET directory_id = $1
        WHERE file_id = $2
        "#,
    )
    .bind(&parent_dir)
    .bind(&file.id)
    .execute(pool)
    .await?;

    Ok(())
}
