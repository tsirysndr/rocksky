use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;
use files::presign_get;
use folders::list;
use s3::Bucket;

pub mod files;
pub mod folders;

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

pub async fn handle(method: &str, payload: &mut web::Payload, req: &HttpRequest, bucket: Box<Bucket>) -> Result<HttpResponse, Error> {
  match method {
    "storage.list" => list(payload, req, bucket.clone()).await,
    "storage.presignGet" => presign_get(payload, req, bucket.clone()).await,
     _ => return Err(anyhow::anyhow!("Method not found")),
  }
}
