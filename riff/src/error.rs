use actix_web::{http::StatusCode, HttpResponse, ResponseError};
use serde::Serialize;
use std::fmt;

/// Errors are rendered in Spotify's envelope (`{"error": {"status", "message"}}`)
/// so a client that already parses Spotify failures needs no special casing.
#[derive(Debug)]
pub enum ApiError {
    NotFound(String),
    BadRequest(String),
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
            ApiError::NotFound(m) | ApiError::BadRequest(m) | ApiError::Internal(m) => m,
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

impl From<duckdb::Error> for ApiError {
    fn from(e: duckdb::Error) -> Self {
        ApiError::Internal(format!("query failed: {e}"))
    }
}

impl From<r2d2::Error> for ApiError {
    fn from(e: r2d2::Error) -> Self {
        ApiError::Internal(format!("could not check out a DuckDB connection: {e}"))
    }
}

impl From<actix_web::error::BlockingError> for ApiError {
    fn from(e: actix_web::error::BlockingError) -> Self {
        ApiError::Internal(format!("query task panicked: {e}"))
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
