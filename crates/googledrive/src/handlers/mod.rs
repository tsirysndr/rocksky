use std::sync::{Arc, Mutex};

use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;
use files::{download_file, get_files, get_files_in_parents};
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

pub async fn handle(method: &str, payload: &mut web::Payload, req: &HttpRequest, conn: Arc<Mutex<Pool<Postgres>>>) -> Result<HttpResponse, Error> {
  match method {
    "googledrive.getFiles" => get_files(payload, req, conn.clone()).await,
    "googledrive.getFilesInParents" => get_files_in_parents(payload, req, conn.clone()).await,
    "googledrive.downloadFile" => download_file(payload, req, conn.clone()).await,
    _ => return Err(anyhow::anyhow!("Method not found")),
  }
}
