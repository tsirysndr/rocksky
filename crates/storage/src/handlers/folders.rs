use actix_web::{HttpRequest, HttpResponse, web};
use anyhow::Error;
use s3::Bucket;
use serde_json::json;
use tokio_stream::StreamExt;

use crate::{read_payload, types::params::ListParams};

pub async fn list(
    payload: &mut web::Payload,
    _req: &HttpRequest,
    bucket: Box<Bucket>,
) -> Result<HttpResponse, Error> {
    let body = read_payload!(payload);
    let params = serde_json::from_slice::<ListParams>(&body)?;
    let (res, _) = bucket
        .list_page(
            params.prefix,
            params.delimiter,
            params.continuation_token,
            params.start_after,
            params.max_keys,
        )
        .await?;

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
