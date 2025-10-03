use crate::{repo::duckdb::DB_PATH, types::AlbumRecord};
use anyhow::Error;
use duckdb::params;

pub async fn save_album(uri: &str, record: AlbumRecord) -> Result<(), anyhow::Error> {
    let uri = uri.to_string();
    tokio::task::spawn_blocking(move || -> Result<(), Error> {
        let conn = duckdb::Connection::open(DB_PATH)?;

        let album_hash =
            sha256::digest(format!("{} - {}", record.title, record.artist).to_lowercase());

        match conn.execute(
            "INSERT INTO albums (
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
                    ) ON CONFLICT (sha256) DO UPDATE SET
                        uri = EXCLUDED.uri,
                        year = EXCLUDED.year,
                        album_art = EXCLUDED.album_art,
                        release_date = EXCLUDED.release_date,
                        artist = EXCLUDED.artist,
                        title = EXCLUDED.title;",
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

        conn.close()
            .map_err(|(_, e)| Error::msg(format!("Error closing connection: {}", e)))?;
        Ok(())
    })
    .await??;

    Ok(())
}
