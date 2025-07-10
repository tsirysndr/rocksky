use sqlx::{Pool, Postgres};
use crate::{types::file::File, xata::google_drive_directory::GoogleDriveDirectory};

pub async fn create_google_drive_directory(
    pool: &Pool<Postgres>,
    file: &File,
    google_drive_id: &str,
    parent_drive_file_id: Option<&str>,
) -> Result<(), sqlx::Error> {
    let parent = if let Some(parent_id) = parent_drive_file_id {
        let results: Vec<GoogleDriveDirectory> = sqlx::query_as(
            r#"
            SELECT *
            FROM google_drive_directories
            WHERE google_drive_id = $1
              AND file_id = $2
            LIMIT 1
            "#
        )
        .bind(google_drive_id)
        .bind(parent_id)
        .fetch_all(pool)
        .await?;
      if results.is_empty() {
        None
      } else {
        Some(results[0].clone())
      }
    } else {
        None
    };

    let (path, parent_id) = match parent {
        Some(p) => (
            format!("{}/{}", p.path.trim_end_matches('/'), file.name),
            Some(p.xata_id),
        ),
        None => (
            format!("/{}", file.name),
            None,
        ),
    };

    sqlx::query(
        r#"
        INSERT INTO google_drive_directories (
            google_drive_id,
            name,
            path,
            file_id,
            parent_id
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
        "#
    )
    .bind(google_drive_id)
    .bind(&file.name)
    .bind(&path)
    .bind(&file.id)
    .bind(parent_id)
    .execute(pool)
    .await?;

    Ok(())
}