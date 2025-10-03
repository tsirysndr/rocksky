use crate::{repo::duckdb::DB_PATH, types::ArtistRecord};
use anyhow::Error;
use duckdb::params;

pub async fn save_artist(uri: &str, record: ArtistRecord) -> Result<(), anyhow::Error> {
    let uri = uri.to_string();
    tokio::task::spawn_blocking(move || -> Result<(), Error> {
        let conn = duckdb::Connection::open(DB_PATH)?;

        let artist_hash = sha256::digest(record.name.to_lowercase());
        match conn.execute(
            &format!(
                "INSERT INTO artists (
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
                    ) ON CONFLICT (sha256) DO UPDATE SET
                        uri = EXCLUDED.uri,
                        tags = EXCLUDED.tags;",
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

        conn.close()
            .map_err(|(_, e)| Error::msg(format!("Error closing connection: {}", e)))?;
        Ok(())
    })
    .await??;

    Ok(())
}
