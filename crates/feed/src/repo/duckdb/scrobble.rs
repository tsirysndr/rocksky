use std::sync::Arc;

use anyhow::Error;
use duckdb::{params, OptionalExt};
use std::sync::Mutex;

use crate::{did::did_to_profile, r2d2_duckdb::DuckDBConnectionManager, types::ScrobbleRecord};

pub async fn save_scrobble(
    pool: r2d2::Pool<DuckDBConnectionManager>,
    mutex: Arc<Mutex<()>>,
    did: &str,
    uri: &str,
    record: ScrobbleRecord,
) -> Result<(), Error> {
    let did = did.to_string();
    let cloned_did = did.clone();

    let uri = uri.to_string();

    let handle = tokio::task::spawn_blocking(move || -> Result<(), Error> {
        tracing::info!("Inserting scrobble for user: {}, scrobble: {}", did, uri);
        let _lock = mutex.lock().unwrap();
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        let mut user = tx.prepare("SELECT id FROM users WHERE did = ?")?;
        let user_id: Option<String> = user.query_row(params![did], |row| row.get(0)).optional()?;

        if user_id.is_none() {
            let rt = tokio::runtime::Runtime::new()?;
            let profile = rt.block_on(did_to_profile(&did))?;

            let avatar = profile.avatar.map(|blob| {
                format!(
                    "https://cdn.bsky.app/img/avatar/plain/{}/{}@{}",
                    did,
                    blob.r#ref.link,
                    blob.mime_type.split('/').last().unwrap_or("jpeg")
                )
            });

            tx.execute(
                "INSERT OR IGNORE INTO users (
                  id,
                  display_name,
                  did,
                  handle,
                  avatar
              ) VALUES (
                  ?,
                  ?,
                  ?,
                  ?,
                  ?)",
                params![
                    xid::new().to_string(),
                    profile.display_name.unwrap_or_default(),
                    did,
                    profile.handle.unwrap_or_default(),
                    avatar,
                ],
            )?;
        }

        let album_hash =
            sha256::digest(format!("{} - {}", record.album, record.album_artist).to_lowercase());

        match tx.execute(
            "INSERT OR IGNORE INTO albums (
                        id,
                        title,
                        artist,
                        release_date,
                        album_art,
                        year,
                        uri,
                        sha256
                    ) VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?
                    )",
            params![
                xid::new().to_string(),
                record.album,
                record.album_artist,
                record.release_date,
                record.album_art_url,
                record.year,
                record.album_uri,
                album_hash,
            ],
        ) {
            Ok(x) => tracing::info!("Album inserted or already exists {}", x),
            Err(e) => tracing::error!(error = %e, "Error inserting album"),
        }

        let artist_hash = sha256::digest(record.album_artist.to_lowercase());
        match tx.execute(
            &format!(
                "INSERT OR IGNORE INTO artists (
                        id,
                        name,
                        sha256,
                        picture,
                        uri,
                        tags
                    ) VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        [{}]
                    )",
                record
                    .tags
                    .as_ref()
                    .map(|tags| tags
                        .iter()
                        .map(|tag| tag.replace('\'', "''"))
                        .map(|tag| format!("'{}'", tag))
                        .collect::<Vec<_>>()
                        .join(", "))
                    .unwrap_or_default()
            ),
            params![
                xid::new().to_string(),
                record.album_artist,
                artist_hash,
                record.artist_picture,
                record.artist_uri
            ],
        ) {
            Ok(x) => tracing::info!("Artist inserted or already exists {}", x),
            Err(e) => tracing::error!(error = %e, "Error inserting artist"),
        }

        let track_hash = sha256::digest(
            format!("{} - {} - {}", record.title, record.artist, record.album).to_lowercase(),
        );
        match tx.execute(
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
                uri,
                sha256
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
            )",
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
                record.song_uri,
                track_hash,
            ],
        ) {
            Ok(x) => tracing::info!("Track inserted or already exists {}", x),
            Err(e) => tracing::error!(error = %e, "Error inserting track"),
        }

        match tx.execute(
            "INSERT OR IGNORE INTO album_tracks (
                id,
                album_id,
                track_id
            ) VALUES (
                ?,
                (SELECT id FROM albums WHERE sha256 = ?),
                (SELECT id FROM tracks WHERE sha256 = ?),
            )",
            params![xid::new().to_string(), album_hash, track_hash],
        ) {
            Ok(x) => tracing::info!("Album-Track relation inserted or already exists {}", x),
            Err(e) => tracing::error!(error = %e, "Error inserting album-track relation"),
        }

        match tx.execute(
            "INSERT OR IGNORE INTO user_artists (
                id,
                user_id,
                artist_id
            ) VALUES (
                ?,
                (SELECT id FROM users WHERE did = ?),
                (SELECT id FROM artists WHERE sha256 = ?),
            )",
            params![xid::new().to_string(), cloned_did, artist_hash],
        ) {
            Ok(x) => tracing::info!("User-Artist relation inserted or already exists {}", x),
            Err(e) => tracing::error!(error = %e, "Error inserting user-artist relation"),
        }

        match tx.execute(
            "INSERT OR IGNORE INTO user_albums (
                id,
                user_id,
                album_id
            ) VALUES (
                ?,
                (SELECT id FROM users WHERE did = ?),
                (SELECT id FROM albums WHERE sha256 = ?),
            )",
            params![xid::new().to_string(), cloned_did, album_hash],
        ) {
            Ok(x) => tracing::info!("User-Album relation inserted or already exists {}", x),
            Err(e) => tracing::error!(error = %e, "Error inserting user-album relation"),
        }

        match tx.execute(
            "INSERT OR IGNORE INTO user_tracks (
                id,
                user_id,
                track_id
            ) VALUES (
                ?,
                (SELECT id FROM users WHERE did = ?),
                (SELECT id FROM tracks WHERE sha256 = ?),
            )",
            params![xid::new().to_string(), cloned_did, track_hash],
        ) {
            Ok(x) => tracing::info!("User-Track relation inserted or already exists {}", x),
            Err(e) => tracing::error!(error = %e, "Error inserting user-track relation"),
        }

        match tx.execute(
            "INSERT OR IGNORE INTO artist_albums (
                id,
                artist_id,
                album_id
            ) VALUES (
                ?,
                (SELECT id FROM artists WHERE sha256 = ?),
                (SELECT id FROM albums WHERE sha256 = ?),
            )",
            params![xid::new().to_string(), artist_hash, album_hash],
        ) {
            Ok(x) => tracing::info!("Artist-Album relation inserted or already exists {}", x),
            Err(e) => tracing::error!(error = %e, "Error inserting artist-album relation"),
        }

        match tx.execute(
            "INSERT OR IGNORE INTO artist_tracks (
                id,
                artist_id,
                track_id
            ) VALUES (
                ?,
                (SELECT id FROM artists WHERE sha256 = ?),
                (SELECT id FROM tracks WHERE sha256 = ?),
            )",
            params![xid::new().to_string(), artist_hash, track_hash],
        ) {
            Ok(x) => tracing::info!("Artist-Track relation inserted or already exists {}", x),
            Err(e) => tracing::error!(error = %e, "Error inserting artist-track relation"),
        }

        match tx.execute(
            "INSERT OR IGNORE INTO scrobbles (
              id,
              user_id,
              track_id,
              album_id,
              artist_id,
              uri,
              created_at
          ) VALUES (
            ?,
            (SELECT id FROM users WHERE did = ?),
            (SELECT id FROM tracks WHERE sha256 = ?),
            (SELECT id FROM albums WHERE sha256 = ?),
            (SELECT id FROM artists WHERE sha256 = ?),
            ?,
            ?,
        )",
            params![
                xid::new().to_string(),
                cloned_did,
                track_hash,
                album_hash,
                artist_hash,
                uri,
                record.created_at,
            ],
        ) {
            Ok(x) => tracing::info!("Scrobble inserted {}", x),
            Err(e) => tracing::error!(error = %e, "Error inserting scrobble"),
        }

        match tx.commit() {
            Ok(_) => tracing::info!("Transaction committed successfully"),
            Err(e) => tracing::error!(error = %e, "Error committing transaction"),
        }

        Ok::<(), Error>(())
    });

    handle.await??;

    Ok(())
}
