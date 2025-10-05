use std::sync::{Arc, Mutex};

use crate::{r2d2_duckdb::DuckDBConnectionManager, types::SongRecord};
use anyhow::Error;
use duckdb::params;

pub async fn save_track(
    pool: r2d2::Pool<DuckDBConnectionManager>,
    mutex: Arc<Mutex<()>>,
    uri: &str,
    record: SongRecord,
) -> Result<(), Error> {
    let _lock = mutex.lock().unwrap();
    let uri = uri.to_string();
    let conn = pool.get()?;
    let track_hash = sha256::digest(
        format!("{} - {} - {}", record.title, record.artist, record.album).to_lowercase(),
    );

    match conn.execute(
        "UPDATE tracks SET uri = ? WHERE sha256 = ?AND uri IS NULL;",
        params![uri, track_hash],
    ) {
        Ok(x) => {
            tracing::info!("Track URI updated successfully: {}", x);
            return Ok(());
        }
        Err(e) => tracing::error!(error = %e, "Error updating track URI"),
    }

    match conn.execute(
        "INSERT OR IGNORE INTO tracks (
                id,
                title,
                artist,
                album_artist,
                album_art,
                album,
                track_number,
                disc_number,
                spotify_link,
                tidal_link,
                youtube_link,
                apple_music_link,
                copyright_message,
                label,
                lyrics,
                composer,
                duration,
                mb_id,
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
                ?,
                ?,
                ?,
                ?,
                ?,
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
            record.album_artist,
            record.album_art_url,
            record.album,
            record.track_number,
            record.disc_number,
            record.spotify_link,
            record.tidal_link,
            record.youtube_link,
            record.apple_music_link,
            record.copyright_message,
            record.label,
            record.lyrics,
            record.composer,
            record.duration,
            record.mbid,
            track_hash,
            uri
        ],
    ) {
        Ok(x) => tracing::info!("Track successfully inserted or updated: {}", x),
        Err(e) => tracing::error!(error = %e, "Error inserting/updating track"),
    }

    Ok(())
}
