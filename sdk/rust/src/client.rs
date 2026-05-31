//! The top-level [`Client`] and its [`ClientBuilder`].

use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::error::{Error, Result};
use crate::http::{DEFAULT_BASE_URL, Shared, Transport};
use crate::resources::{
    ActorApi, AlbumApi, ApikeyApi, ArtistApi, ChartsApi, DropboxApi, FeedApi, GoogleDriveApi,
    GraphApi, LikeApi, MirrorApi, PlayerApi, PlaylistApi, ScrobbleApi, ShoutApi, SongApi,
    SpotifyApi, StatsApi,
};

/// Default user agent (`rocksky-rust/<version>`).
pub fn default_user_agent() -> String {
    format!("rocksky-rust/{}", env!("CARGO_PKG_VERSION"))
}

/// Async client for the Rocksky XRPC API.
///
/// `Client` is cheap to clone — every clone shares one underlying connection
/// pool and one token slot.
///
/// ```no_run
/// # use rocksky::Client;
/// # async fn run() -> rocksky::Result<()> {
/// let client = Client::builder()
///     .base_url("https://api.rocksky.app")
///     .token("…")
///     .build();
///
/// let me = client.actor().get_profile_me().await?;
/// println!("{:?}", me.handle);
/// # Ok(()) }
/// ```
#[derive(Debug, Clone)]
pub struct Client {
    transport: Shared,
}

impl Default for Client {
    fn default() -> Self {
        Self::new()
    }
}

impl Client {
    /// Build a client with default settings (unauthenticated, default base URL).
    pub fn new() -> Self {
        ClientBuilder::new().build()
    }

    /// Start a [`ClientBuilder`].
    pub fn builder() -> ClientBuilder {
        ClientBuilder::new()
    }

    /// The current base URL (no trailing slash).
    pub fn base_url(&self) -> &str {
        &self.transport.base_url
    }

    /// The current bearer token, if any.
    pub async fn token(&self) -> Option<String> {
        self.transport.current_token().await
    }

    /// Update the bearer token used for subsequent requests.
    pub async fn set_token(&self, token: impl Into<Option<String>>) {
        self.transport.set_token(token.into()).await;
    }

    /// `app.rocksky.actor.*`
    pub fn actor(&self) -> ActorApi<'_> {
        ActorApi::new(self)
    }

    /// `app.rocksky.album.*`
    pub fn album(&self) -> AlbumApi<'_> {
        AlbumApi::new(self)
    }

    /// `app.rocksky.apikey.*`
    pub fn apikey(&self) -> ApikeyApi<'_> {
        ApikeyApi::new(self)
    }

    /// `app.rocksky.artist.*`
    pub fn artist(&self) -> ArtistApi<'_> {
        ArtistApi::new(self)
    }

    /// `app.rocksky.charts.*`
    pub fn charts(&self) -> ChartsApi<'_> {
        ChartsApi::new(self)
    }

    /// `app.rocksky.dropbox.*`
    pub fn dropbox(&self) -> DropboxApi<'_> {
        DropboxApi::new(self)
    }

    /// `app.rocksky.feed.*`
    pub fn feed(&self) -> FeedApi<'_> {
        FeedApi::new(self)
    }

    /// `app.rocksky.googledrive.*`
    pub fn googledrive(&self) -> GoogleDriveApi<'_> {
        GoogleDriveApi::new(self)
    }

    /// `app.rocksky.graph.*`
    pub fn graph(&self) -> GraphApi<'_> {
        GraphApi::new(self)
    }

    /// `app.rocksky.like.*`
    pub fn like(&self) -> LikeApi<'_> {
        LikeApi::new(self)
    }

    /// `app.rocksky.mirror.*`
    pub fn mirror(&self) -> MirrorApi<'_> {
        MirrorApi::new(self)
    }

    /// `app.rocksky.player.*`
    pub fn player(&self) -> PlayerApi<'_> {
        PlayerApi::new(self)
    }

    /// `app.rocksky.playlist.*`
    pub fn playlist(&self) -> PlaylistApi<'_> {
        PlaylistApi::new(self)
    }

    /// `app.rocksky.scrobble.*`
    pub fn scrobble(&self) -> ScrobbleApi<'_> {
        ScrobbleApi::new(self)
    }

    /// `app.rocksky.shout.*`
    pub fn shout(&self) -> ShoutApi<'_> {
        ShoutApi::new(self)
    }

    /// `app.rocksky.song.*`
    pub fn song(&self) -> SongApi<'_> {
        SongApi::new(self)
    }

    /// `app.rocksky.spotify.*`
    pub fn spotify(&self) -> SpotifyApi<'_> {
        SpotifyApi::new(self)
    }

    /// `app.rocksky.stats.*`
    pub fn stats(&self) -> StatsApi<'_> {
        StatsApi::new(self)
    }

    /// Escape hatch — call any XRPC `query` (GET) method, even ones the typed
    /// API doesn't wrap. Returns the parsed JSON body.
    pub async fn call(&self, method: &str) -> Result<Value> {
        self.transport.query(method, &(), false).await
    }

    /// Escape hatch with params + auth toggle.
    pub async fn call_with<P: Serialize + ?Sized>(
        &self,
        method: &str,
        params: &P,
        auth: bool,
    ) -> Result<Value> {
        self.transport.query(method, params, auth).await
    }

    /// Escape hatch for procedures (POST).
    pub async fn procedure<P: Serialize + ?Sized, B: Serialize + ?Sized>(
        &self,
        method: &str,
        params: Option<&P>,
        body: Option<&B>,
        auth: bool,
    ) -> Result<Value> {
        self.transport.procedure(method, params, body, auth).await
    }

    pub(crate) async fn query_as<T, P>(&self, method: &str, params: &P, auth: bool) -> Result<T>
    where
        T: DeserializeOwned,
        P: Serialize + ?Sized,
    {
        self.transport.query_as(method, params, auth).await
    }

    pub(crate) async fn procedure_as<T, P, B>(
        &self,
        method: &str,
        params: Option<&P>,
        body: Option<&B>,
        auth: bool,
    ) -> Result<T>
    where
        T: DeserializeOwned,
        P: Serialize + ?Sized,
        B: Serialize + ?Sized,
    {
        self.transport.procedure_as(method, params, body, auth).await
    }
}

/// Builder for [`Client`].
#[derive(Debug, Default)]
pub struct ClientBuilder {
    base_url: Option<String>,
    token: Option<String>,
    user_agent: Option<String>,
    timeout: Option<Duration>,
    http: Option<reqwest::Client>,
}

impl ClientBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the API base URL (default: `https://api.rocksky.app`).
    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = Some(url.into());
        self
    }

    /// Set the bearer token for authenticated calls.
    pub fn token(mut self, token: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self
    }

    /// Override the user-agent header.
    pub fn user_agent(mut self, ua: impl Into<String>) -> Self {
        self.user_agent = Some(ua.into());
        self
    }

    /// Per-request timeout (default: `reqwest`'s default — no explicit timeout).
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// Provide your own `reqwest::Client` (handy for sharing a pool, mounting
    /// a mock transport in tests, or wiring proxies).
    pub fn http_client(mut self, http: reqwest::Client) -> Self {
        self.http = Some(http);
        self
    }

    /// Build the client. Falls back to `reqwest::Client::new()` when no
    /// `http_client` was supplied; if you need a non-default reqwest build,
    /// construct it yourself and pass it via [`http_client`](Self::http_client).
    pub fn build(self) -> Client {
        let http = if let Some(http) = self.http {
            http
        } else {
            let mut builder = reqwest::Client::builder();
            if let Some(t) = self.timeout {
                builder = builder.timeout(t);
            }
            builder.build().unwrap_or_else(|_| reqwest::Client::new())
        };

        let transport = Transport::new(
            http,
            self.base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
            self.token,
            self.user_agent.unwrap_or_else(default_user_agent),
        );

        Client {
            transport: Arc::new(transport),
        }
    }

    /// Build, validating the base URL parses. Use this if you accept a URL
    /// from user input.
    pub fn try_build(self) -> Result<Client> {
        if let Some(url) = self.base_url.as_deref() {
            url::Url::parse(url).map_err(|e| Error::InvalidConfig(format!("base_url: {e}")))?;
        }
        Ok(self.build())
    }
}
