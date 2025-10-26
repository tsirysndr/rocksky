use std::sync::Arc;

use actix_web::{HttpRequest, HttpResponse, web};
use anyhow::Error;
use files::{
    create_music_folder, download_file, get_files, get_files_at, get_metadata, get_temporary_link,
    scan_folder,
};
use sqlx::{Pool, Postgres};

pub mod files;

#[macro_export]
macro_rules! read_payload {
    ($payload:expr) => {{
        let mut body = Vec::new();
        while let Some(chunk) = $payload.next().await {
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
        "dropbox.getFiles" => get_files(payload, req, conn.clone()).await,
        "dropbox.createMusicFolder" => create_music_folder(payload, req, conn.clone()).await,
        "dropbox.getFilesAt" => get_files_at(payload, req, conn.clone()).await,
        "dropbox.downloadFile" => download_file(payload, req, conn.clone()).await,
        "dropbox.getTemporaryLink" => get_temporary_link(payload, req, conn.clone()).await,
        "dropbox.getMetadata" => get_metadata(payload, req, conn.clone()).await,
        "dropbox.scanFolder" => scan_folder(payload, req, conn.clone()).await,
        _ => return Err(anyhow::anyhow!("Method not found")),
    }
}
