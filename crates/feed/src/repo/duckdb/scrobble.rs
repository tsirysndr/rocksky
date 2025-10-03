use anyhow::Error;
use duckdb::{params, OptionalExt};

use crate::{did::did_to_profile, repo::duckdb::DB_PATH, types::ScrobbleRecord};

pub async fn save_scrobble(
    did: &str,
    uri: &str,
    record: ScrobbleRecord,
) -> Result<(), anyhow::Error> {
    let did = did.to_string();
    let cloned_did = did.clone();

    let uri = uri.to_string();

    tokio::task::spawn_blocking(move || -> Result<(), Error> {
        let mut conn = duckdb::Connection::open(DB_PATH)?;
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
                        sha256
                    ) VALUES (
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
                        tags
                    ) VALUES (
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
                        .map(|tag| format!("'{}'", tag))
                        .collect::<Vec<_>>()
                        .join(", "))
                    .unwrap_or_default()
            ),
            params![xid::new().to_string(), record.album_artist, artist_hash],
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
            CURRENT_TIMESTAMP,
        )",
            params![
                xid::new().to_string(),
                cloned_did,
                track_hash,
                album_hash,
                artist_hash,
                uri,
            ],
        ) {
            Ok(x) => tracing::info!("Scrobble inserted {}", x),
            Err(e) => tracing::error!(error = %e, "Error inserting scrobble"),
        }

        tx.commit()?;

        conn.close()
            .map_err(|(_, e)| Error::msg(format!("Error closing connection: {}", e)))?;

        Ok(())
    })
    .await??;

    Ok(())
}
