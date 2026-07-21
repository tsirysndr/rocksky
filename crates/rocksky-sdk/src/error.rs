//! The SDK's error type. A library must not leak `anyhow` to its callers, so the
//! app's `anyhow::Result` becomes a typed [`SdkError`] here.

/// Errors returned by the Rocksky SDK.
#[derive(thiserror::Error, Debug)]
pub enum SdkError {
    /// No session is loaded — the caller must log in first.
    #[error("not signed in")]
    NotAuthenticated,

    /// A stored session could not be resumed (expired / revoked refresh token).
    #[error("session expired — re-authenticate")]
    SessionExpired,

    /// A record lookup found nothing (e.g. a not-yet-created singleton). Getters
    /// map this to `Ok(None)`; it surfaces here only for the low-level paths.
    #[error("record not found")]
    RecordNotFound,

    /// A non-2xx response from an AppView XRPC endpoint.
    #[error("appview {nsid} -> {status}: {body}")]
    AppView {
        nsid: String,
        status: u16,
        body: String,
    },

    /// Anything from the jacquard auth / XRPC / OAuth stack. jacquard's own error
    /// types are erased to their `Display` string so they don't leak into our
    /// public surface.
    #[error("auth: {0}")]
    Auth(String),

    #[error(transparent)]
    Http(#[from] reqwest::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    /// Catch-all with context.
    #[error("{0}")]
    Other(String),
}

/// The SDK's result alias.
pub type Result<T> = core::result::Result<T, SdkError>;

/// Erase a jacquard (or any `Display`) error into [`SdkError::Auth`].
pub(crate) fn auth_err<E: core::fmt::Display>(e: E) -> SdkError {
    SdkError::Auth(e.to_string())
}
