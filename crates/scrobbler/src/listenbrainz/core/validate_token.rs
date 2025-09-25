use actix_web::HttpResponse;
use anyhow::Error;

use crate::auth::decode_token;

pub async fn validate_token(token: &str) -> Result<HttpResponse, Error> {
    match decode_token(token) {
        Ok(_) => Ok(HttpResponse::Ok().json(serde_json::json!({
          "status": "ok",
          "payload": {
            "valid": true,
          },
        }))),
        Err(e) => {
            tracing::error!(error = %e, "Failed to validate token");
            Ok(HttpResponse::BadRequest().json(serde_json::json!({
              "error": 4,
              "message": format!("Failed to validate token: {}", e)
            })))
        }
    }
}
