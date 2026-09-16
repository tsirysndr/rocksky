//! The XRPC error envelope.
//!
//! Wire-compatible with `@atproto/xrpc-server`, which the TypeScript API uses:
//! a failed call answers `{ "error": <name>, "message": <text> }`. The `error`
//! name is the `ResponseType` *enum variant* (`AuthRequired`, not
//! `AuthenticationRequired`) unless a handler supplied a custom name, and 500s
//! never leak details — they always answer the generic type string. Both of
//! those are easy to get subtly wrong, so they are pinned by tests below.

use actix_web::http::StatusCode;
use actix_web::{HttpResponse, ResponseError};
use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResponseType {
    InvalidRequest,
    AuthRequired,
    Forbidden,
    XrpcNotSupported,
    NotAcceptable,
    PayloadTooLarge,
    UnsupportedMediaType,
    RateLimitExceeded,
    InternalServerError,
    MethodNotImplemented,
    UpstreamFailure,
    NotEnoughResources,
    UpstreamTimeout,
}

impl ResponseType {
    pub fn status(self) -> StatusCode {
        match self {
            Self::InvalidRequest => StatusCode::BAD_REQUEST,
            Self::AuthRequired => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::XrpcNotSupported => StatusCode::NOT_FOUND,
            Self::NotAcceptable => StatusCode::NOT_ACCEPTABLE,
            Self::PayloadTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            Self::UnsupportedMediaType => StatusCode::UNSUPPORTED_MEDIA_TYPE,
            Self::RateLimitExceeded => StatusCode::TOO_MANY_REQUESTS,
            Self::InternalServerError => StatusCode::INTERNAL_SERVER_ERROR,
            Self::MethodNotImplemented => StatusCode::NOT_IMPLEMENTED,
            Self::UpstreamFailure => StatusCode::BAD_GATEWAY,
            Self::NotEnoughResources => StatusCode::SERVICE_UNAVAILABLE,
            Self::UpstreamTimeout => StatusCode::GATEWAY_TIMEOUT,
        }
    }

    /// `ResponseType[type]` in the TypeScript enum — the default `error` name.
    pub fn name(self) -> &'static str {
        match self {
            Self::InvalidRequest => "InvalidRequest",
            Self::AuthRequired => "AuthRequired",
            Self::Forbidden => "Forbidden",
            Self::XrpcNotSupported => "XRPCNotSupported",
            Self::NotAcceptable => "NotAcceptable",
            Self::PayloadTooLarge => "PayloadTooLarge",
            Self::UnsupportedMediaType => "UnsupportedMediaType",
            Self::RateLimitExceeded => "RateLimitExceeded",
            Self::InternalServerError => "InternalServerError",
            Self::MethodNotImplemented => "MethodNotImplemented",
            Self::UpstreamFailure => "UpstreamFailure",
            Self::NotEnoughResources => "NotEnoughResources",
            Self::UpstreamTimeout => "UpstreamTimeout",
        }
    }

    /// `ResponseTypeStrings[type]` — the fallback `message`.
    pub fn message(self) -> &'static str {
        match self {
            Self::InvalidRequest => "Invalid Request",
            Self::AuthRequired => "Authentication Required",
            Self::Forbidden => "Forbidden",
            Self::XrpcNotSupported => "XRPC Not Supported",
            Self::NotAcceptable => "Not Acceptable",
            Self::PayloadTooLarge => "Payload Too Large",
            Self::UnsupportedMediaType => "Unsupported Media Type",
            Self::RateLimitExceeded => "Rate Limit Exceeded",
            Self::InternalServerError => "Internal Server Error",
            Self::MethodNotImplemented => "Method Not Implemented",
            Self::UpstreamFailure => "Upstream Failure",
            Self::NotEnoughResources => "Not Enough Resources",
            Self::UpstreamTimeout => "Upstream Timeout",
        }
    }

    /// Maps an arbitrary upstream status onto the enum, matching
    /// `httpResponseCodeToEnum`: any other 4xx collapses to InvalidRequest and
    /// anything else to InternalServerError.
    pub fn from_status(status: u16) -> Self {
        match status {
            400 => Self::InvalidRequest,
            401 => Self::AuthRequired,
            403 => Self::Forbidden,
            404 => Self::XrpcNotSupported,
            406 => Self::NotAcceptable,
            413 => Self::PayloadTooLarge,
            415 => Self::UnsupportedMediaType,
            429 => Self::RateLimitExceeded,
            500 => Self::InternalServerError,
            501 => Self::MethodNotImplemented,
            502 => Self::UpstreamFailure,
            503 => Self::NotEnoughResources,
            504 => Self::UpstreamTimeout,
            400..=499 => Self::InvalidRequest,
            _ => Self::InternalServerError,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub error: String,
    pub message: String,
}

/// An error that renders as an XRPC failure. `kind` picks the status and the
/// default name/message; `name` overrides the `error` field the way
/// `customErrorName` does in the TypeScript server.
#[derive(Debug)]
pub struct XrpcError {
    pub kind: ResponseType,
    pub name: Option<String>,
    pub detail: Option<String>,
    /// Logged, never serialized — the cause behind a 500.
    pub source: Option<anyhow::Error>,
}

impl XrpcError {
    pub fn new(kind: ResponseType) -> Self {
        Self {
            kind,
            name: None,
            detail: None,
            source: None,
        }
    }

    pub fn with_message(kind: ResponseType, message: impl Into<String>) -> Self {
        Self {
            kind,
            name: None,
            detail: Some(message.into()),
            source: None,
        }
    }

    /// Sets the custom `error` name, e.g. `InvalidFilter`.
    pub fn named(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::with_message(ResponseType::InvalidRequest, message)
    }

    pub fn auth_required(message: impl Into<String>) -> Self {
        Self::with_message(ResponseType::AuthRequired, message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::with_message(ResponseType::Forbidden, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::with_message(ResponseType::XrpcNotSupported, message)
    }

    pub fn rate_limited(message: impl Into<String>) -> Self {
        Self::with_message(ResponseType::RateLimitExceeded, message)
    }

    /// A feature that needs a companion service this instance wasn't given.
    /// Self-hosted setups hit this rather than a crash on startup.
    pub fn not_configured(feature: &str) -> Self {
        Self::with_message(
            ResponseType::MethodNotImplemented,
            format!("{feature} is not configured on this instance"),
        )
        .named("NotConfigured")
    }

    pub fn internal(source: impl Into<anyhow::Error>) -> Self {
        Self {
            kind: ResponseType::InternalServerError,
            name: None,
            detail: None,
            source: Some(source.into()),
        }
    }

    pub fn body(&self) -> ErrorBody {
        let internal = self.kind == ResponseType::InternalServerError;
        ErrorBody {
            error: self
                .name
                .clone()
                .unwrap_or_else(|| self.kind.name().to_string()),
            // 500s answer the bare type string so nothing about the failure
            // leaks, exactly like `XRPCError#payload`.
            message: if internal {
                self.kind.message().to_string()
            } else {
                self.detail
                    .clone()
                    .unwrap_or_else(|| self.kind.message().to_string())
            },
        }
    }
}

impl fmt::Display for XrpcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let body = self.body();
        write!(f, "{}: {}", body.error, body.message)?;
        if let Some(source) = &self.source {
            write!(f, " ({source:#})")?;
        }
        Ok(())
    }
}

impl std::error::Error for XrpcError {}

impl ResponseError for XrpcError {
    fn status_code(&self) -> StatusCode {
        self.kind.status()
    }

    fn error_response(&self) -> HttpResponse {
        if let Some(source) = &self.source {
            tracing::error!(error = ?source, "xrpc handler failed");
        }
        HttpResponse::build(self.status_code()).json(self.body())
    }
}

impl From<sqlx::Error> for XrpcError {
    fn from(err: sqlx::Error) -> Self {
        Self::internal(err)
    }
}

impl From<anyhow::Error> for XrpcError {
    fn from(err: anyhow::Error) -> Self {
        Self::internal(err)
    }
}

impl From<reqwest::Error> for XrpcError {
    fn from(err: reqwest::Error) -> Self {
        // A companion service that timed out or refused the connection is an
        // upstream problem, not a bug in this process.
        let kind = if err.is_timeout() {
            ResponseType::UpstreamTimeout
        } else if err.is_connect() || err.is_request() {
            ResponseType::UpstreamFailure
        } else {
            ResponseType::InternalServerError
        };
        Self {
            kind,
            name: None,
            detail: (kind != ResponseType::InternalServerError).then(|| err.to_string()),
            source: Some(err.into()),
        }
    }
}

pub type XrpcResult<T> = Result<T, XrpcError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_required_uses_the_enum_variant_name_not_the_display_name() {
        // ResponseTypeNames says "AuthenticationRequired", but `payload` reads
        // `ResponseType[type]`, which is "AuthRequired". Clients match on this.
        let body = XrpcError::new(ResponseType::AuthRequired).body();
        assert_eq!(body.error, "AuthRequired");
        assert_eq!(body.message, "Authentication Required");
    }

    #[test]
    fn internal_errors_never_leak_detail() {
        let err = XrpcError::internal(anyhow::anyhow!("connection string: user:hunter2@db"));
        let body = err.body();
        assert_eq!(body.error, "InternalServerError");
        assert_eq!(body.message, "Internal Server Error");
        assert!(!body.message.contains("hunter2"));
    }

    #[test]
    fn custom_names_override_the_default() {
        let body = XrpcError::invalid_request("Unknown filter field \"nope\"")
            .named("InvalidFilter")
            .body();
        assert_eq!(body.error, "InvalidFilter");
        assert_eq!(body.message, "Unknown filter field \"nope\"");
    }

    #[test]
    fn missing_detail_falls_back_to_the_type_string() {
        let body = XrpcError::new(ResponseType::InvalidRequest).body();
        assert_eq!(body.error, "InvalidRequest");
        assert_eq!(body.message, "Invalid Request");
    }

    #[test]
    fn unlisted_4xx_collapses_to_invalid_request() {
        assert_eq!(ResponseType::from_status(418), ResponseType::InvalidRequest);
        assert_eq!(ResponseType::from_status(409), ResponseType::InvalidRequest);
        assert_eq!(
            ResponseType::from_status(599),
            ResponseType::InternalServerError
        );
    }

    #[test]
    fn statuses_match_the_typescript_enum_values() {
        assert_eq!(
            ResponseType::InvalidRequest.status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            ResponseType::AuthRequired.status(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            ResponseType::XrpcNotSupported.status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            ResponseType::MethodNotImplemented.status(),
            StatusCode::NOT_IMPLEMENTED
        );
    }
}
