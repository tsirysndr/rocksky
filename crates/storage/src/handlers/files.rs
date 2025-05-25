use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;
use s3::Bucket;

pub async fn presign_get(
    _payload: &mut web::Payload,
    _req: &HttpRequest,
    _bucket: Box<Bucket>,
) -> Result<HttpResponse, Error> {
    todo!()
}
