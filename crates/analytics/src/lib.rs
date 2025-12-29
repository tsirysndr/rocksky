use std::{
    env,
    str::FromStr,
    sync::{Arc, Mutex},
    thread,
};

use anyhow::Error;
use duckdb::Connection;
use sqlx::postgres::PgPoolOptions;

use crate::core::{create_tables, update_artist_genres};

pub mod cmd;
pub mod core;
pub mod handlers;
pub mod subscriber;
pub mod types;
pub mod xata;

pub async fn serve() -> Result<(), Error> {
    let conn = Connection::open("./rocksky-analytics.ddb")?;

    create_tables(&conn).await?;

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let conn = Arc::new(Mutex::new(conn));
    update_artist_genres(conn.clone(), &pool).await?;

    export_parquets(conn.clone());
    cmd::serve::serve(conn).await?;

    Ok(())
}

pub async fn sync() -> Result<(), Error> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("XATA_POSTGRES_URL")?)
        .await?;

    let conn = Connection::open("./rocksky-analytics.ddb")?;
    create_tables(&conn).await?;

    let conn = Arc::new(Mutex::new(conn));

    cmd::sync::sync(conn, &pool).await?;

    Ok(())
}

fn export_parquets(conn: Arc<Mutex<Connection>>) {
    thread::spawn(move || {
        // fire every 5 minutes
        let cron_expr = "0 */5 * * * * *";
        let schedule = cron::Schedule::from_str(cron_expr);
        if let Err(err) = schedule {
            tracing::error!("Failed to parse cron expression: {}", cron_expr);
            tracing::error!(error = %err);
            return Ok(());
        }
        let schedule = schedule.unwrap();
        loop {
            let now = chrono::Utc::now();
            let mut upcoming = schedule.upcoming(chrono::Utc).take(1);

            if let Some(next) = upcoming.next() {
                let duration = next.signed_duration_since(now).to_std().unwrap();
                thread::sleep(duration);
                tracing::info!("Exporting parquets ...");

                let conn = conn.lock().unwrap();
                conn.execute_batch(
                    "BEGIN;
                     COPY (SELECT * FROM scrobbles) TO 'scrobbles.parquet' (FORMAT PARQUET);
                     COPY (SELECT * FROM artists) TO 'artists.parquet' (FORMAT PARQUET);
                     COPY (SELECT * FROM albums) TO 'albums.parquet' (FORMAT PARQUET);
                     COPY (SELECT * FROM tracks) TO 'tracks.parquet' (FORMAT PARQUET);
                     COPY (SELECT * FROM users) TO 'users.parquet' (FORMAT PARQUET);
                     COPY (SELECT * FROM album_tracks) TO 'album_tracks.parquet' (FORMAT PARQUET);
                     COPY (SELECT * FROM artist_albums) TO 'artist_albums.parquet' (FORMAT PARQUET);
                     COPY (SELECT * FROM artist_tracks) TO 'artist_tracks.parquet' (FORMAT PARQUET);
                     COPY (SELECT * FROM loved_tracks) TO 'loved_tracks.parquet' (FORMAT PARQUET);
                     COPY (SELECT * FROM user_albums) TO 'user_albums.parquet' (FORMAT PARQUET);
                     COPY (SELECT * FROM user_artists) TO 'user_artists.parquet' (FORMAT PARQUET);
                     COPY (SELECT * FROM user_tracks) TO 'user_tracks.parquet' (FORMAT PARQUET);
                     COMMIT;",
                )?;

                drop(conn);

                if env::var("CF_ACCOUNT_ID").is_err() {
                    tracing::warn!("CF_ACCOUNT_ID is not set, skipping upload to R2");
                    continue;
                }

                upload_to_r2("scrobbles.parquet");
                upload_to_r2("artists.parquet");
                upload_to_r2("albums.parquet");
                upload_to_r2("tracks.parquet");
                upload_to_r2("users.parquet");
                upload_to_r2("album_tracks.parquet");
                upload_to_r2("artist_albums.parquet");
                upload_to_r2("artist_tracks.parquet");
                upload_to_r2("loved_tracks.parquet");
                upload_to_r2("user_albums.parquet");
                upload_to_r2("user_artists.parquet");
                upload_to_r2("user_tracks.parquet");

                tracing::info!("Exported parquets successfully.");
            }
        }

        #[allow(unreachable_code)]
        Ok::<(), Error>(())
    });
}

fn upload_to_r2(file: &str) {
    let status = std::process::Command::new("aws")
        .arg("s3")
        .arg("cp")
        .arg(file)
        .arg(format!(
            "s3://{}",
            env::var("R2_BUCKET_NAME").unwrap_or("rocksky-backup".to_string())
        ))
        .arg("--endpoint-url")
        .arg(&format!(
            "https://{}.r2.cloudflarestorage.com",
            env::var("CF_ACCOUNT_ID").unwrap()
        ))
        .arg("--profile")
        .arg("r2")
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit())
        .status();
    match status {
        Ok(status) => {
            if status.success() {
                tracing::info!("Uploaded {} to R2 successfully.", file);
            } else {
                tracing::error!("Failed to upload {} to R2.", file);
            }
        }
        Err(err) => {
            tracing::error!("Failed to execute aws command: {}", err);
        }
    };
}
