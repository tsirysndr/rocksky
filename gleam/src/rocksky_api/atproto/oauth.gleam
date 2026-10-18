//// Binding to `@atproto/oauth-client-node` (with the custom `authorize`
//// that forwards a `prompt` parameter), `@atproto/jwk-jose` and the
//// `redlock`-backed request lock.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option}
import rocksky_api/node/js.{type Exception}

pub type Client

pub type Session

/// Persistence callbacks for the OAuth state and session stores.
pub type Store {
  Store(
    get: fn(String) -> Promise(Result(Option(String), Exception)),
    set: fn(String, String, Option(String)) -> Promise(Result(Nil, Exception)),
    del: fn(String) -> Promise(Result(Nil, Exception)),
  )
}

pub type Config {
  Config(
    client_name: String,
    client_id: String,
    client_uri: String,
    redirect_uris: List(String),
    scope: String,
    /// `private_key_jwt` with ES256 when `True`, `none` otherwise.
    confidential: Bool,
    jwks_uri: Option(String),
    /// Importable private keys (PEM/JWK), only used when confidential.
    private_keys: List(String),
    state_store: Store,
    session_store: Store,
    redis_url: String,
    /// `unreachable.host=proxy.host` pairs applied at the fetch layer.
    pds_host_overrides: List(#(String, String)),
  )
}

@external(javascript, "./oauth_ffi.mjs", "createClient")
pub fn create_client(config: Config) -> Promise(Result(Client, Exception))

@external(javascript, "./oauth_ffi.mjs", "clientMetadata")
pub fn client_metadata(client: Client) -> Dynamic

/// Starts the authorization flow; the URL to redirect the user to.
@external(javascript, "./oauth_ffi.mjs", "authorize")
pub fn authorize(
  client: Client,
  input: String,
  scope: String,
  prompt: Option(String),
) -> Promise(Result(String, Exception))

/// Completes the flow from the callback query string.
@external(javascript, "./oauth_ffi.mjs", "callback")
pub fn callback(
  client: Client,
  query_string: String,
) -> Promise(Result(Session, Exception))

@external(javascript, "./oauth_ffi.mjs", "restore")
pub fn restore(
  client: Client,
  did: String,
) -> Promise(Result(Session, Exception))

@external(javascript, "./oauth_ffi.mjs", "sessionDid")
pub fn session_did(session: Session) -> String

/// The authorization server rejected the session (revoked, expired, invalid).
@external(javascript, "./oauth_ffi.mjs", "isSessionRejected")
pub fn is_session_rejected(e: Exception) -> Bool

/// Installs the host-override `fetch` globally. Must run before any agent is built.
@external(javascript, "./oauth_ffi.mjs", "installPdsProxyFetch")
pub fn install_pds_proxy_fetch(overrides: List(#(String, String))) -> Nil
