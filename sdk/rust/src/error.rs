//! SDK error types.
//!
//! All fallible methods return [`Result<T>`]. `Error::Api` carries the full
//! server response (status, XRPC method id, error code, message, body).

use serde_json::Value;
use thiserror::Error;

pub type Result<T, E = Error> = std::result::Result<T, E>;

/// Top-level error returned by every SDK call.
#[derive(Debug, Error)]
pub enum Error {
    /// The server returned a non-2xx response.
    #[error("[{status}] {method}: {summary}", summary = .message.as_deref().or(.error.as_deref()).unwrap_or("no message"))]
    Api {
        status: u16,
        method: String,
        error: Option<String>,
        message: Option<String>,
        body: Option<Value>,
    },

    /// Request didn't reach the server (network / timeout / TLS).
    #[error("transport error calling {method}: {source}")]
    Transport {
        method: String,
        #[source]
        source: reqwest::Error,
    },

    /// Failed to parse / serialize JSON.
    #[error("json error in {method}: {source}")]
    Json {
        method: String,
        #[source]
        source: serde_json::Error,
    },

    /// Caller supplied an invalid configuration (bad URL, missing token, …).
    #[error("invalid configuration: {0}")]
    InvalidConfig(String),

    /// Method requires authentication and no token is set on the client.
    #[error("[401] {method}: missing token — call ClientBuilder::token(...) or Client::set_token(...)")]
    MissingToken { method: String },
}

impl Error {
    /// The HTTP status code, if this is an API-level error.
    pub fn status(&self) -> Option<u16> {
        match self {
            Error::Api { status, .. } => Some(*status),
            Error::MissingToken { .. } => Some(401),
            _ => None,
        }
    }

    /// True for 4xx responses (client errors).
    pub fn is_client_error(&self) -> bool {
        matches!(self.status(), Some(s) if (400..500).contains(&s))
    }

    /// True for 5xx responses (server errors).
    pub fn is_server_error(&self) -> bool {
        matches!(self.status(), Some(s) if (500..600).contains(&s))
    }

    /// True for 401 Unauthorized.
    pub fn is_unauthorized(&self) -> bool {
        matches!(self.status(), Some(401))
    }

    /// True for 403 Forbidden.
    pub fn is_forbidden(&self) -> bool {
        matches!(self.status(), Some(403))
    }

    /// True for 404 Not Found.
    pub fn is_not_found(&self) -> bool {
        matches!(self.status(), Some(404))
    }

    /// True for 429 Too Many Requests.
    pub fn is_rate_limited(&self) -> bool {
        matches!(self.status(), Some(429))
    }
}
