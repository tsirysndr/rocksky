use actix_web::HttpResponse;
use serde_json::json;

use crate::response;

pub fn handle(format: &str) -> HttpResponse {
    response::ok(format, json!({}))
}
