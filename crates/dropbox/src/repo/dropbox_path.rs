use sqlx::{Pool, Postgres};

use crate::types::file::Entry;
use crate::xata::dropbox_diretory::DropboxDirectory;
use crate::xata::track::Track;

pub async fn create_dropbox_path(
    pool: &Pool<Postgres>,
    file: &Entry,
    track: &Track,
    dropbox_id: &str,
    parent_dir: Option<&str>,
) -> Result<(), sqlx::Error> {
    let results: Vec<DropboxDirectory> = sqlx::query_as(
        r#"
        SELECT *
        FROM dropbox_directories
        WHERE dropbox_id = $1
          AND path = $2
        LIMIT 1
        "#,
    )
    .bind(dropbox_id)
    .bind(parent_dir)
    .fetch_all(pool)
    .await?;

    let parent_dir = match parent_dir {
        Some(_) => results.first().map(|d| d.clone().xata_id),
        None => None,
    };

    sqlx::query(
        r#"
    INSERT INTO dropbox_paths (dropbox_id, path, file_id, track_id, name, directory_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT DO NOTHING
  "#,
    )
    .bind(dropbox_id)
    .bind(&file.path_display)
    .bind(&file.id)
    .bind(&track.xata_id)
    .bind(&file.name)
    .bind(&parent_dir)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        UPDATE dropbox_paths
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
