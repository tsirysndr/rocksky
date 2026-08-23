use actix_web::{http::StatusCode, HttpResponse, ResponseError};
use serde::Serialize;
use std::fmt;

/// Errors are rendered in the same envelope riff uses
/// (`{"error": {"status", "message"}}`) so ops tooling that already parses one
/// service's failures parses both.
#[derive(Debug)]
pub enum ApiError {
    NotFound(String),
    BadRequest(String),
    Conflict(String),
    Unavailable(String),
    Internal(String),
}

#[derive(Serialize)]
struct ErrorEnvelope {
    error: ErrorBody,
}

#[derive(Serialize)]
struct ErrorBody {
    status: u16,
    message: String,
}

impl ApiError {
    fn message(&self) -> &str {
        match self {
            ApiError::NotFound(m)
            | ApiError::BadRequest(m)
            | ApiError::Conflict(m)
            | ApiError::Unavailable(m)
            | ApiError::Internal(m) => m,
        }
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.message())
    }
}

impl ResponseError for ApiError {
    fn status_code(&self) -> StatusCode {
        match self {
            ApiError::NotFound(_) => StatusCode::NOT_FOUND,
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::Conflict(_) => StatusCode::CONFLICT,
            ApiError::Unavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            ApiError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let status = self.status_code();
        if status == StatusCode::INTERNAL_SERVER_ERROR {
            log::error!("{}", self.message());
        }
        HttpResponse::build(status).json(ErrorEnvelope {
            error: ErrorBody {
                status: status.as_u16(),
                message: self.message().to_string(),
            },
        })
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
