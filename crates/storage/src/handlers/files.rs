use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;

pub async fn presign_get(payload: &mut web::Payload, _req: &HttpRequest,) -> Result<HttpResponse, Error> {
  todo!()
}