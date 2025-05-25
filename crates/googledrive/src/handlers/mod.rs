use std::sync::Arc;

use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;
use files::{
    create_music_directory, download_file, get_file, get_files_in_parents, get_music_directory,
    scan_folder,
};
use sqlx::{Pool, Postgres};

pub mod files;

#[macro_export]
macro_rules! read_payload {
    ($payload:expr) => {{
        let mut body = Vec::new();
        while let Some(chunk) = $payload.next().await {
            // skip if None
            match chunk {
                Ok(bytes) => body.extend_from_slice(&bytes),
                Err(err) => return Err(err.into()),
            }
        }
        body
    }};
}

pub async fn handle(
    method: &str,
    payload: &mut web::Payload,
    req: &HttpRequest,
    conn: Arc<Pool<Postgres>>,
) -> Result<HttpResponse, Error> {
    match method {
        "googledrive.getFilesInParents" => get_files_in_parents(payload, req, conn.clone()).await,
        "googledrive.createMusicDirectory" => {
            create_music_directory(payload, req, conn.clone()).await
        }
        "googledrive.getMusicDirectory" => get_music_directory(payload, req, conn.clone()).await,
        "googledrive.getFile" => get_file(payload, req, conn.clone()).await,
        "googledrive.downloadFile" => download_file(payload, req, conn.clone()).await,
        "googledrive.scanFolder" => scan_folder(payload, req, conn.clone()).await,
        _ => return Err(anyhow::anyhow!("Method not found")),
    }
}
