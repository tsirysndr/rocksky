use std::sync::{Arc, Mutex};

use crate::types::ArtistRecord;
use anyhow::Error;
use duckdb::params;

pub fn save_artist(
    conn: Arc<Mutex<duckdb::Connection>>,
    uri: &str,
    record: ArtistRecord,
) -> Result<(), Error> {
    let conn = conn.lock().unwrap();
    let uri = uri.to_string();

    let artist_hash = sha256::digest(record.name.to_lowercase());

    match conn.execute(
        "UPDATE artists SET uri = ?, picture = ? WHERE sha256 = ? AND URI IS NULL;",
        params![uri, record.picture_url, artist_hash],
    ) {
        Ok(x) => {
            tracing::info!("Artist URI updated successfully: {}", x);
            return Ok(());
        }
        Err(e) => tracing::error!(error = %e, "Error updating artist URI"),
    }

    match conn.execute(
        &format!(
            "INSERT OR IGNORE INTO artists (
                        id,
                        name,
                        picture,
                        sha256,
                        uri,
                        tags
                    ) VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        [{}]
                    );",
            record
                .tags
                .as_ref()
                .map(|tags| tags
                    .iter()
                    .map(|tag| format!("'{}'", tag))
                    .collect::<Vec<_>>()
                    .join(", "))
                .unwrap_or_default()
        ),
        params![
            xid::new().to_string(),
            record.name,
            record.picture_url,
            artist_hash,
            uri
        ],
    ) {
        Ok(x) => tracing::info!("Artist successfully inserted or updated: {}", x),
        Err(e) => tracing::error!(error = %e, "Error inserting/updating artist"),
    }

    Ok(())
}
