use actix_web::{web, HttpRequest, HttpResponse};
use anyhow::Error;
use s3::{creds::Credentials, Bucket, Region};
use serde_json::json;
use tokio_stream::StreamExt;

use crate::{read_payload, types::params::ListParams};

pub async fn list(payload: &mut web::Payload, _req: &HttpRequest,) -> Result<HttpResponse, Error> {
  let body = read_payload!(payload);
  let params = serde_json::from_slice::<ListParams>(&body)?;
  let access_key = std::env::var("ACCESS_KEY").expect("ACCESS_KEY not set");
  let secret_key = std::env::var("SECRET_KEY").expect("SECRET_KEY not set");
  let bucket_name = std::env::var("BUCKET_NAME").expect("BUCKET_NAME not set");
  let account_id = std::env::var("ACCOUNT_ID").expect("ACCOUNT_ID not set");

  let bucket = Bucket::new(
      &bucket_name,
      Region::R2 { account_id },
      Credentials::new(
          Some(access_key.as_str()),
          Some(secret_key.as_str()),
          None,
          None,
          None
      )?,
  )?
  .with_path_style();

  let (res, _) = bucket.list_page(params.prefix, params.delimiter, params.continuation_token, params.start_after, params.max_keys).await?;


  Ok(HttpResponse::Ok().json(json!({
    "max_keys": res.max_keys,
    "prefix": res.prefix,
    "continuation_token": res.continuation_token,
    "encoding_type": res.encoding_type,
    "is_truncated": res.is_truncated,
    "next_continuation_token": res.next_continuation_token,
    "contents": res.contents.iter().map(|content| {
      json!({
        "key": content.key,
        "last_modified": content.last_modified,
        "etag": content.e_tag,
        "size": content.size,
        "storage_class": content.storage_class,
      })
    }).collect::<Vec<_>>()
  })))

}
