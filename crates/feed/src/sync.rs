use std::env;

use anyhow::Error;
use owo_colors::OwoColorize;
use sqlx::postgres::{PgPoolOptions, PgRow};
use sqlx::Row;

use crate::repo::{Repo, RepoImpl};
use crate::types::ScrobbleRecord;

pub async fn sync_scrobbles(ddb: RepoImpl) -> Result<(), Error> {
    tracing::info!("Starting scrobble synchronization...");

    let (tx, mut rx) = tokio::sync::mpsc::channel::<PgRow>(100);

    let handle = tokio::spawn(async move {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&env::var("XATA_POSTGRES_URL")?)
            .await?;

        const BATCH_SIZE: i64 = 1000;

        let total_scrobbles: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM scrobbles")
            .fetch_one(&pool)
            .await?;
        let total_scrobbles = total_scrobbles.0;
        tracing::info!(total = %total_scrobbles.magenta(), "Total scrobbles to sync");

        let start = env::var("SYNC_START_OFFSET")
            .ok()
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);

        for offset in (start..total_scrobbles).step_by(BATCH_SIZE as usize) {
            tracing::info!(
                offset = %(offset).magenta(),
                end = %(offset + BATCH_SIZE).magenta(),
                "Syncing scrobbles batch:",
            );
            let result = sqlx::query(
                r#"
      SELECT
        s.xata_id,
        s.user_id,
        s.track_id,
        s.album_id,
        s.artist_id,
        s.uri,
        s.timestamp,
        a.*,
        ar.*,
        t.*,
        u.*,
        a.uri AS album_uri,
        ar.uri AS artist_uri,
        t.uri AS track_uri,
        a.title AS album_title,
        a.youtube_link AS album_youtube_link,
        a.spotify_link AS album_spotify_link,
        a.tidal_link AS album_tidal_link,
        a.apple_music_link AS album_apple_music_link
      FROM scrobbles s
        LEFT JOIN albums a ON s.album_id = a.xata_id
        LEFT JOIN artists ar ON s.artist_id = ar.xata_id
        LEFT JOIN tracks t ON s.track_id = t.xata_id
        LEFT JOIN users u ON s.user_id = u.xata_id
      ORDER BY s.timestamp DESC
      LIMIT $1 OFFSET $2
    "#,
            )
            .bind(BATCH_SIZE)
            .bind(offset as i64)
            .fetch_all(&pool)
            .await?;

            for row in result {
                tx.send(row).await?;
            }
        }

        Ok::<(), Error>(())
    });

    let mut i = env::var("SYNC_START_OFFSET")
        .ok()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0)
        + 1;

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let total_scrobbles: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM scrobbles")
        .fetch_one(&pool)
        .await?;
    let total_scrobbles = total_scrobbles.0;

    let repo = ddb.clone();
    repo.create_tables().await?;

    while let Some(row) = rx.recv().await {
        // println!("{:#?}", row);
        tracing::info!(count = %i.magenta(), total = %total_scrobbles.magenta(), "Inserting scrobble...");

        let scrobble_uri = row.get::<Option<String>, _>("uri");
        if scrobble_uri.is_none() {
            tracing::warn!(count = %i.magenta(), "Skipping scrobble with no URI");
            continue;
        }
        let scrobble_uri = scrobble_uri.unwrap();

        let did = row.get::<String, _>("did");
        let record: ScrobbleRecord = ScrobbleRecord {
            track_number: row.get::<Option<i32>, _>("track_number"),
            disc_number: row.get::<Option<i32>, _>("disc_number"),
            title: row.get::<String, _>("title"),
            artist: row.get::<String, _>("artist"),
            album_artist: row.get::<String, _>("album_artist"),
            album_art_url: row.get::<Option<String>, _>("album_art"),
            album: row.get::<String, _>("album"),
            duration: row.get::<i32, _>("duration"),
            release_date: row.get::<Option<String>, _>("release_date"),
            year: row.get::<Option<i32>, _>("year"),
            genre: row.get::<Option<String>, _>("genre"),
            tags: row.get::<Option<Vec<String>>, _>("genres"),
            composer: row.get::<Option<String>, _>("composer"),
            lyrics: row.get::<Option<String>, _>("lyrics"),
            copyright_message: row.get::<Option<String>, _>("copyright_message"),
            wiki: None,
            youtube_link: row.get::<Option<String>, _>("youtube_link"),
            spotify_link: row.get::<Option<String>, _>("spotify_link"),
            tidal_link: row.get::<Option<String>, _>("tidal_link"),
            apple_music_link: row.get::<Option<String>, _>("apple_music_link"),
            created_at: row
                .get::<chrono::DateTime<chrono::Utc>, _>("timestamp")
                .to_rfc3339(),
            label: row.get::<Option<String>, _>("label"),
            mbid: row.get::<Option<String>, _>("mb_id"),
            artist_picture: row.get::<Option<String>, _>("picture"),
            artist_uri: row.get::<Option<String>, _>("artist_uri"),
            album_uri: row.get::<Option<String>, _>("album_uri"),
            song_uri: row.get::<Option<String>, _>("track_uri"),
        };

        let repo = ddb.clone();
        repo.insert_scrobble(&did, &scrobble_uri, record).await?;

        i += 1;
    }

    handle.await??;
    Ok(())
}
