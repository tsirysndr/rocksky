use std::sync::{Arc, Mutex};

use crate::r2d2_duckdb::DuckDBConnectionManager;
use crate::types::AlbumRecord;
use anyhow::Error;
use duckdb::params;

pub async fn save_album(
    pool: r2d2::Pool<DuckDBConnectionManager>,
    mutex: Arc<Mutex<()>>,
    uri: &str,
    record: AlbumRecord,
) -> Result<(), Error> {
    let _lock = mutex.lock().unwrap();
    let uri = uri.to_string();
    let conn = pool.get()?;

    let album_hash = sha256::digest(format!("{} - {}", record.title, record.artist).to_lowercase());

    match conn.execute(
        "UPDATE albums SET uri = ? WHERE sha256 = ? AND uri IS NULL;",
        params![uri, album_hash],
    ) {
        Ok(x) => {
            tracing::info!("Album URI updated successfully: {}", x);
            return Ok(());
        }
        Err(e) => tracing::error!(error = %e, "Error updating album URI"),
    }

    match conn.execute(
        "INSERT OR IGNORE INTO albums (
                        id,
                        title,
                        artist,
                        release_date,
                        album_art,
                        year,
                        sha256,
                        uri
                    ) VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?
                    );",
        params![
            xid::new().to_string(),
            record.title,
            record.artist,
            record.release_date,
            record.album_art_url,
            record.year,
            album_hash,
            uri
        ],
    ) {
        Ok(x) => tracing::info!("Album successfully inserted or updated: {}", x),
        Err(e) => tracing::error!(error = %e, "Error inserting/updating album"),
    }

    Ok(())
}
