//! ATProto OAuth login.
//!
//! The client runs in one of two modes, chosen by whether a `domain` is
//! configured:
//!
//! |                  | no domain (localhost)                      | `domain` set                                   |
//! |------------------|--------------------------------------------|------------------------------------------------|
//! | client type      | public                                     | **confidential**                               |
//! | `client_id`      | `http://localhost?redirect_uri=…&scope=…`  | `https://<domain>/oauth-client-metadata.json`  |
//! | auth method      | `none`                                     | `private_key_jwt` (ES256)                      |
//! | keyset           | none                                       | generated, persisted, served at `/jwks.json`   |
//! | refresh tokens   | short-lived                                | **long-lived**                                 |
//!
//! The loopback `client_id` form exists precisely because an authorization
//! server cannot fetch a metadata document from `localhost`; it is how local
//! development logs in at all. It is also why a public deployment *needs*
//! `domain`: without it the instance would keep presenting loopback
//! credentials that no real authorization server will accept from a routable
//! host.
//!
//! The confidential mode is not just tidier. atproto grants confidential
//! clients much longer-lived refresh tokens, so a self-hosted instance with a
//! domain keeps its users signed in instead of asking them again every few
//! days. [`refresher`] then keeps sessions from lapsing while nobody is
//! looking.

pub mod keys;
pub mod refresher;
pub mod store;

use crate::config::Config;
use jacquard_identity::JacquardResolver;
use jacquard_oauth::atproto::{AtprotoClientMetadata, GrantType};
use jacquard_oauth::client::OAuthClient;
use jacquard_oauth::keyset::Keyset;
use jacquard_oauth::scopes::Scopes;
use jacquard_oauth::session::ClientData;
use smol_str::SmolStr;
use store::SqliteAuthStore;

/// The scopes requested at login, matching `SCOPES` in
/// `apps/api/src/auth/client.ts`.
///
/// These must stay in step with what the handlers actually write: a scope
/// missing here means a record write is refused at runtime, and a scope listed
/// but unused is an over-broad consent prompt. `atproto` is mandatory.
pub const SCOPES: &[&str] = &[
    "atproto",
    "repo:app.rocksky.album",
    "repo:app.rocksky.artist",
    "repo:app.rocksky.graph.follow",
    "repo:app.rocksky.like",
    "repo:app.rocksky.playlist",
    "repo:app.rocksky.playlist.song",
    "repo:app.rocksky.scrobble",
    "repo:app.rocksky.shout",
    "repo:app.rocksky.song",
    "repo:app.rocksky.feed.generator",
    "repo:fm.teal.feed.play",
    "repo:fm.teal.actor.status",
    "repo:fm.teal.alpha.feed.play",
    "repo:fm.teal.alpha.actor.status",
    "repo:app.rocksky.actor.status",
    "repo:app.rocksky.rockbox.audio.settings",
    "repo:app.rocksky.equalizer",
];

pub fn scope_string() -> String {
    SCOPES.join(" ")
}

/// Which kind of OAuth client this instance is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientMode {
    /// `domain` is set: confidential, `private_key_jwt`, long-lived refresh.
    Confidential,
    /// No domain: the loopback client form, for local development.
    Loopback,
}

impl ClientMode {
    /// Chosen by whether the instance has a public https identity.
    pub fn of(config: &Config) -> Self {
        if config.public_url.starts_with("https://") {
            Self::Confidential
        } else {
            Self::Loopback
        }
    }

    pub fn is_confidential(self) -> bool {
        matches!(self, Self::Confidential)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum OauthError {
    #[error(transparent)]
    Keyset(#[from] keys::KeysetError),
    #[error("could not build the OAuth client metadata: {0}")]
    Metadata(String),
}

/// The base URL the redirect URI is built on.
///
/// For loopback, `127.0.0.1` rather than `localhost`: the atproto spec allows
/// only the literal loopback IPs as redirect targets.
fn redirect_base(config: &Config) -> String {
    match ClientMode::of(config) {
        ClientMode::Confidential => config.public_url.trim_end_matches('/').to_string(),
        ClientMode::Loopback => format!("http://127.0.0.1:{}", config.port),
    }
}

pub fn redirect_uri(config: &Config) -> String {
    format!("{}/oauth/callback", redirect_base(config))
}

/// The document URL that also serves as the `client_id` in confidential mode.
pub fn client_metadata_url(config: &Config) -> String {
    format!(
        "{}/oauth-client-metadata.json",
        config.public_url.trim_end_matches('/')
    )
}

/// The `client_id` this instance presents.
pub fn client_id(config: &Config) -> String {
    match ClientMode::of(config) {
        ClientMode::Confidential => client_metadata_url(config),
        // The loopback form encodes the redirect and scope in the identifier
        // itself, since there is no document for the server to fetch.
        ClientMode::Loopback => format!(
            "http://localhost?redirect_uri={}&scope={}",
            urlencode(&redirect_uri(config)),
            urlencode(&scope_string()),
        ),
    }
}

/// Percent-encodes a query-parameter value.
fn urlencode(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 2);
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            b' ' => out.push_str("%20"),
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

/// Builds the client registration metadata for this instance.
pub fn client_metadata(config: &Config) -> Result<AtprotoClientMetadata<SmolStr>, OauthError> {
    let scopes = Scopes::new(SmolStr::new(scope_string()))
        .map_err(|err| OauthError::Metadata(format!("{err:?}")))?;

    let parse = |what: &str, url: &str| {
        url.parse()
            .map_err(|err| OauthError::Metadata(format!("{what} {url:?} is not a URL: {err:?}")))
    };

    let mut metadata = AtprotoClientMetadata {
        client_id: parse("client_id", &client_id(config))?,
        client_uri: parse("client_uri", config.public_url.trim_end_matches('/')).ok(),
        redirect_uris: vec![parse("redirect_uri", &redirect_uri(config))?],
        grant_types: vec![GrantType::AuthorizationCode, GrantType::RefreshToken],
        scopes,
        jwks_uri: None,
        client_name: Some(SmolStr::new("Rocksky")),
        logo_uri: None,
        tos_uri: None,
        privacy_policy_uri: None,
    };

    // A confidential client publishes its keys by URL rather than inline, so
    // the authorization server can refetch them when they rotate.
    if ClientMode::of(config).is_confidential() {
        metadata.jwks_uri = Some(parse(
            "jwks_uri",
            &format!("{}/jwks.json", config.public_url.trim_end_matches('/')),
        )?);
    }

    Ok(metadata)
}

/// The OAuth client, ready to start and complete logins.
pub type RockskyOAuthClient = OAuthClient<JacquardResolver<reqwest::Client>, SqliteAuthStore>;

/// Everything the login routes need.
pub struct OauthService {
    pub client: RockskyOAuthClient,
    pub mode: ClientMode,
    /// The serialized client metadata document, served at
    /// `/oauth-client-metadata.json`.
    pub metadata_document: serde_json::Value,
    /// Public JWKS, served at `/jwks.json`. `None` for a loopback client,
    /// which has no keys.
    pub jwks: Option<serde_json::Value>,
}

impl OauthService {
    /// Builds the service from config, generating the keyset when the instance
    /// is confidential.
    pub fn new(
        config: &Config,
        auth_db: sqlx::SqlitePool,
        http: reqwest::Client,
    ) -> Result<Self, OauthError> {
        let mode = ClientMode::of(config);
        let keyset: Option<Keyset> = if mode.is_confidential() {
            Some(keys::load_or_create(&config.data_dir)?)
        } else {
            None
        };

        let metadata = client_metadata(config)?;
        // Rendered once at startup: it is a constant for the lifetime of the
        // process, and it also validates the configuration early rather than
        // on the first login attempt.
        let rendered = jacquard_oauth::atproto::atproto_client_metadata(&metadata, &keyset)
            .map_err(|err| OauthError::Metadata(format!("{err:?}")))?;
        let metadata_document =
            serde_json::to_value(&rendered).map_err(|err| OauthError::Metadata(err.to_string()))?;

        let jwks = keyset
            .as_ref()
            .map(|keyset| serde_json::to_value(keyset.public_jwks()))
            .transpose()
            .map_err(|err| OauthError::Metadata(err.to_string()))?;

        let store = SqliteAuthStore::new(auth_db, http.clone());
        let client = OAuthClient::new(
            store,
            ClientData {
                keyset,
                config: metadata,
            },
            http,
        );

        tracing::info!(
            mode = ?mode,
            client_id = %client_id(config),
            redirect_uri = %redirect_uri(config),
            "OAuth client ready"
        );

        Ok(Self {
            client,
            mode,
            metadata_document,
            jwks,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn local() -> Config {
        let mut config = Config::for_test();
        config.port = 3004;
        config.public_url = "http://localhost:3004".into();
        config
    }

    fn public() -> Config {
        let mut config = Config::for_test();
        config.domain = Some("rocksky.example.com".into());
        config.public_url = "https://rocksky.example.com".into();
        config
    }

    #[test]
    fn a_domain_makes_the_client_confidential() {
        assert_eq!(ClientMode::of(&public()), ClientMode::Confidential);
        assert!(ClientMode::of(&public()).is_confidential());

        // Localhost cannot be confidential: no authorization server can fetch
        // a metadata document from it.
        assert_eq!(ClientMode::of(&local()), ClientMode::Loopback);
        assert!(!ClientMode::of(&local()).is_confidential());
    }

    #[test]
    fn a_confidential_client_is_identified_by_its_metadata_url() {
        let config = public();
        assert_eq!(
            client_id(&config),
            "https://rocksky.example.com/oauth-client-metadata.json"
        );
        assert_eq!(
            redirect_uri(&config),
            "https://rocksky.example.com/oauth/callback"
        );
    }

    #[test]
    fn a_loopback_client_encodes_its_redirect_and_scope_in_the_client_id() {
        let config = local();
        let id = client_id(&config);

        assert!(id.starts_with("http://localhost?"), "{id}");
        assert!(
            id.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A3004%2Foauth%2Fcallback"),
            "{id}"
        );
        assert!(id.contains("scope=atproto"), "{id}");

        // The spec allows only the literal loopback IP as a redirect target,
        // not the name "localhost".
        assert_eq!(
            redirect_uri(&config),
            "http://127.0.0.1:3004/oauth/callback"
        );
    }

    #[test]
    fn the_confidential_metadata_document_advertises_private_key_jwt() {
        let config = public();
        let metadata = client_metadata(&config).unwrap();
        let keyset = Keyset::generate_es256("test").unwrap();
        let rendered =
            jacquard_oauth::atproto::atproto_client_metadata(&metadata, &Some(keyset)).unwrap();
        let document = serde_json::to_value(&rendered).unwrap();

        assert_eq!(
            document["token_endpoint_auth_method"], "private_key_jwt",
            "{document}"
        );
        assert_eq!(document["token_endpoint_auth_signing_alg"], "ES256");
        assert_eq!(
            document["jwks_uri"], "https://rocksky.example.com/jwks.json",
            "a confidential client publishes keys by URL so they can rotate"
        );
        assert_eq!(document["application_type"], "web");
        assert_eq!(document["dpop_bound_access_tokens"], true);
        // Long-lived sessions need the refresh grant.
        let grants = document["grant_types"].as_array().unwrap();
        assert!(grants.iter().any(|g| g == "refresh_token"), "{document}");
        assert!(
            grants.iter().any(|g| g == "authorization_code"),
            "{document}"
        );
        // The private half must never appear in the document.
        assert!(!document.to_string().contains("\"d\""), "{document}");
    }

    #[test]
    fn the_loopback_metadata_document_uses_no_client_authentication() {
        let config = local();
        let metadata = client_metadata(&config).unwrap();
        let rendered = jacquard_oauth::atproto::atproto_client_metadata(&metadata, &None).unwrap();
        let document = serde_json::to_value(&rendered).unwrap();

        assert_eq!(document["token_endpoint_auth_method"], "none");
        assert!(document["jwks_uri"].is_null(), "{document}");
        assert_eq!(document["application_type"], "native");
    }

    #[test]
    fn the_requested_scopes_cover_what_the_handlers_write() {
        // A scope missing here becomes a refused write at runtime.
        for scope in [
            "atproto",
            "repo:app.rocksky.scrobble",
            "repo:app.rocksky.song",
            "repo:app.rocksky.album",
            "repo:app.rocksky.artist",
            "repo:app.rocksky.like",
            "repo:app.rocksky.shout",
            "repo:app.rocksky.playlist",
            "repo:app.rocksky.graph.follow",
        ] {
            assert!(SCOPES.contains(&scope), "missing scope {scope}");
        }
        assert_eq!(SCOPES[0], "atproto", "the atproto scope is mandatory");
        // And the list parses as a scope set.
        Scopes::new(SmolStr::new(scope_string())).expect("scopes must be valid");
    }

    #[test]
    fn query_values_are_percent_encoded() {
        assert_eq!(
            urlencode("http://127.0.0.1:3004/oauth/callback"),
            "http%3A%2F%2F127.0.0.1%3A3004%2Foauth%2Fcallback"
        );
        // Scopes are space separated, and a raw space would truncate the value.
        assert_eq!(urlencode("atproto repo:x"), "atproto%20repo%3Ax");
        assert_eq!(urlencode("a-b_c.d~e"), "a-b_c.d~e");
    }

    #[tokio::test]
    async fn the_service_builds_in_both_modes() {
        let db = crate::db::connect_auth("sqlite::memory:").await.unwrap();

        let dir = tempfile::tempdir().unwrap();
        let mut config = public();
        config.data_dir = dir.path().to_path_buf();
        let service =
            OauthService::new(&config, db.clone(), reqwest::Client::new()).expect("confidential");
        assert!(service.mode.is_confidential());
        assert!(
            service.jwks.is_some(),
            "a confidential client publishes keys"
        );
        assert_eq!(
            service.metadata_document["token_endpoint_auth_method"],
            "private_key_jwt"
        );

        let service = OauthService::new(&local(), db, reqwest::Client::new()).expect("loopback");
        assert!(!service.mode.is_confidential());
        assert!(service.jwks.is_none(), "a loopback client has no keys");
    }
}
