//! ATProto identity resolution, in both directions.
//!
//! An account has two names: a DID, which never changes, and a handle, which
//! is a domain the holder can change or lose. Everything stored refers to the
//! DID; everything a person sees is the handle. Converting between them is
//! this crate.
//!
//! It was previously done in two places that each knew one direction —
//! `rocksky-atproto` read a DID document for the handle, and the appview's
//! session module resolved a handle for login — with no cache and no
//! verification. This is both directions, cached, and verified.
//!
//! # A handle is a claim until the DID agrees
//!
//! Handle resolution answers "which DID does `alice.example` claim to be?",
//! and anybody who controls `alice.example` can claim anything. The claim is
//! only true if that DID's document *also* lists the handle in
//! `alsoKnownAs` — the DID document is the authority, and the handle record is
//! a pointer to it.
//!
//! Skipping the second half means someone who can serve a DNS record or a file
//! at a domain can be resolved as another person's DID. [`Resolver::resolve`]
//! always confirms it. [`Resolver::resolve_handle_unverified`] exists for the
//! login path, which then authenticates against the PDS anyway, and its name
//! says what it does not do.
//!
//! # Two ways a handle points at a DID
//!
//! | method                              | who uses it                       |
//! |-------------------------------------|------------------------------------|
//! | DNS `TXT _atproto.<handle>`         | most hosted handles                |
//! | `https://<handle>/.well-known/atproto-did` | a domain serving its own handle |
//!
//! Both are tried. The spec gives DNS precedence, and that order is kept: a
//! domain that serves an HTTP file it no longer controls the DNS for should
//! not be able to override the DNS answer.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

pub mod document;

pub use document::{DidDocument, Service};

/// Where `did:plc:` documents are read from.
pub const DEFAULT_PLC_DIRECTORY: &str = "https://plc.directory";

/// The appview used as the last resort for a handle.
///
/// Only reached when both DNS and the well-known file fail, which in practice
/// means a handle whose domain no longer serves either.
pub const DEFAULT_RESOLVER: &str = "https://public.api.bsky.app";

/// How long a resolution is reused.
///
/// Handles change rarely and a stale one is a cosmetic error, but a DID
/// document also carries the PDS, and pointing a write at a PDS the account has
/// left is not cosmetic. Five minutes is short enough that a migration is
/// picked up within one, and long enough that a page of fifty scrobbles is one
/// lookup rather than fifty.
pub const DEFAULT_TTL: Duration = Duration::from_secs(300);

#[derive(Debug, thiserror::Error)]
pub enum ResolveError {
    #[error("{0} is not a DID this resolver understands (expected did:plc: or did:web:)")]
    UnsupportedMethod(String),

    #[error("could not reach the directory for {subject}: {source}")]
    Fetch {
        subject: String,
        #[source]
        source: reqwest::Error,
    },

    #[error("the directory answered {status} for {subject}")]
    Status { subject: String, status: u16 },

    #[error("the DID document for {0} could not be read")]
    Malformed(String),

    #[error("{0} does not resolve to a DID")]
    UnresolvableHandle(String),

    #[error(
        "{handle} claims {claimed}, but that DID's document does not list the handle — \
         the claim is unverified and has been refused"
    )]
    HandleNotConfirmed { handle: String, claimed: String },

    #[error("the DID document for {0} names no PDS")]
    NoPds(String),
}

/// What an account resolves to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    pub did: String,
    /// `None` when the document declares no `at://` alias, which is legal and
    /// means the account has no handle right now.
    pub handle: Option<String>,
    /// Base URL of the account's PDS, without a trailing slash.
    pub pds: Option<String>,
}

/// Resolves DIDs and handles, with a TTL cache.
///
/// Cheap to clone; clones share one cache.
#[derive(Clone)]
pub struct Resolver {
    http: reqwest::Client,
    plc_directory: String,
    fallback_resolver: String,
    ttl: Duration,
    cache: Arc<tokio::sync::Mutex<Cache>>,
    dns: Arc<tokio::sync::OnceCell<Option<hickory_resolver::TokioAsyncResolver>>>,
}

#[derive(Default)]
struct Cache {
    /// Keyed by DID, since that is the stable name.
    identities: HashMap<String, (Instant, Identity)>,
    /// Keyed by handle. Separate, because a handle can point at a DID whose
    /// document does not list it — and that negative result is worth caching
    /// too, or a bad handle is re-resolved on every request.
    handles: HashMap<String, (Instant, Option<String>)>,
}

impl Resolver {
    pub fn new(http: reqwest::Client) -> Self {
        Self {
            http,
            plc_directory: DEFAULT_PLC_DIRECTORY.to_string(),
            fallback_resolver: DEFAULT_RESOLVER.to_string(),
            ttl: DEFAULT_TTL,
            cache: Arc::new(tokio::sync::Mutex::new(Cache::default())),
            dns: Arc::new(tokio::sync::OnceCell::new()),
        }
    }

    /// Points `did:plc:` lookups somewhere else — an edge cache, or a local
    /// mirror.
    pub fn plc_directory(mut self, url: impl Into<String>) -> Self {
        self.plc_directory = url.into().trim_end_matches('/').to_string();
        self
    }

    /// The appview to ask when a handle resolves neither way.
    pub fn fallback_resolver(mut self, url: impl Into<String>) -> Self {
        self.fallback_resolver = url.into().trim_end_matches('/').to_string();
        self
    }

    pub fn ttl(mut self, ttl: Duration) -> Self {
        self.ttl = ttl;
        self
    }

    /// Resolves either a DID or a handle.
    ///
    /// The one method most callers want: every API that takes an "actor" takes
    /// both spellings, so the branch belongs here rather than at each site.
    pub async fn resolve(&self, actor: &str) -> Result<Identity, ResolveError> {
        let actor = actor.trim();
        if actor.starts_with("did:") {
            return self.resolve_did(actor).await;
        }

        // Normalised once, here, and used for both the lookup and the
        // confirmation. Normalising only inside the lookup — as an earlier
        // version did — means `@Alice.Example` resolves correctly and is then
        // refused, because the raw input no longer matches what the document
        // declares.
        let handle = normalize_handle(actor);

        let claimed = self
            .resolve_handle_unverified(&handle)
            .await?
            .ok_or_else(|| ResolveError::UnresolvableHandle(handle.clone()))?;

        let identity = self.resolve_did(&claimed).await?;

        // The claim is only true if the DID agrees — see the module note.
        if !identity
            .handle
            .as_deref()
            .is_some_and(|declared| declared.eq_ignore_ascii_case(&handle))
        {
            return Err(ResolveError::HandleNotConfirmed {
                handle: handle.clone(),
                claimed,
            });
        }

        Ok(identity)
    }

    /// Resolves a DID to its handle and PDS.
    pub async fn resolve_did(&self, did: &str) -> Result<Identity, ResolveError> {
        if let Some(cached) = self.cached_identity(did).await {
            return Ok(cached);
        }

        let url = self.document_url(did)?;
        let document = self.fetch_document(&url, did).await?;

        let identity = Identity {
            did: did.to_string(),
            handle: document.handle().map(str::to_string),
            pds: document.pds().map(str::to_string),
        };

        self.cache
            .lock()
            .await
            .identities
            .insert(did.to_string(), (Instant::now(), identity.clone()));

        Ok(identity)
    }

    /// The handle a DID currently declares.
    pub async fn handle_of(&self, did: &str) -> Result<Option<String>, ResolveError> {
        Ok(self.resolve_did(did).await?.handle)
    }

    /// The PDS a DID's records live on.
    pub async fn pds_of(&self, did: &str) -> Result<String, ResolveError> {
        self.resolve_did(did)
            .await?
            .pds
            .ok_or_else(|| ResolveError::NoPds(did.to_string()))
    }

    /// The DID a handle points at, **without** confirming the DID agrees.
    ///
    /// For the login flow, which authenticates against the PDS immediately
    /// afterwards and so does not depend on this being true. Anything that
    /// treats the answer as an identity should call [`Resolver::resolve`].
    pub async fn resolve_handle_unverified(
        &self,
        handle: &str,
    ) -> Result<Option<String>, ResolveError> {
        let handle = normalize_handle(handle);
        if !is_plausible_handle(&handle) {
            return Ok(None);
        }

        if let Some(cached) = self.cached_handle(&handle).await {
            return Ok(cached);
        }

        let resolved = self.lookup_handle(&handle).await;

        self.cache
            .lock()
            .await
            .handles
            .insert(handle, (Instant::now(), resolved.clone()));

        Ok(resolved)
    }

    /// DNS first, then the well-known file, then an appview.
    async fn lookup_handle(&self, handle: &str) -> Option<String> {
        if let Some(did) = self.lookup_dns(handle).await {
            return Some(did);
        }
        if let Some(did) = self.lookup_well_known(handle).await {
            return Some(did);
        }
        self.lookup_appview(handle).await
    }

    /// `TXT _atproto.<handle>`, whose value is `did=<did>`.
    async fn lookup_dns(&self, handle: &str) -> Option<String> {
        let resolver = self
            .dns
            .get_or_init(|| async {
                match hickory_resolver::TokioAsyncResolver::tokio_from_system_conf() {
                    Ok(resolver) => Some(resolver),
                    Err(err) => {
                        // A container with no resolv.conf is a normal
                        // deployment, and the well-known path still works.
                        tracing::debug!(error = %err, "no system DNS; skipping TXT lookups");
                        None
                    }
                }
            })
            .await
            .as_ref()?;

        let name = format!("_atproto.{handle}");
        let response = resolver.txt_lookup(&name).await.ok()?;

        response.iter().find_map(|record| {
            record.iter().find_map(|chunk| {
                let text = String::from_utf8_lossy(chunk);
                text.trim()
                    .strip_prefix("did=")
                    .map(str::trim)
                    .filter(|did| did.starts_with("did:"))
                    .map(str::to_string)
            })
        })
    }

    async fn lookup_well_known(&self, handle: &str) -> Option<String> {
        let url = format!("https://{handle}/.well-known/atproto-did");
        let response = self.http.get(&url).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }

        let body = response.text().await.ok()?;
        let did = body.trim();
        // The file must contain the DID and nothing else; a site that serves
        // an HTML error page with a 200 would otherwise resolve to garbage.
        (did.starts_with("did:") && !did.contains(char::is_whitespace)).then(|| did.to_string())
    }

    async fn lookup_appview(&self, handle: &str) -> Option<String> {
        #[derive(serde::Deserialize)]
        struct Resolved {
            did: String,
        }

        let url = format!(
            "{}/xrpc/com.atproto.identity.resolveHandle?handle={handle}",
            self.fallback_resolver
        );
        let response = self.http.get(&url).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        response.json::<Resolved>().await.ok().map(|r| r.did)
    }

    fn document_url(&self, did: &str) -> Result<String, ResolveError> {
        if let Some(domain) = did.strip_prefix("did:web:") {
            // did:web encodes the host, with %3A for a port.
            let host = domain.replace("%3A", ":");
            Ok(format!("https://{host}/.well-known/did.json"))
        } else if did.starts_with("did:plc:") {
            Ok(format!("{}/{did}", self.plc_directory))
        } else {
            Err(ResolveError::UnsupportedMethod(did.to_string()))
        }
    }

    async fn fetch_document(&self, url: &str, did: &str) -> Result<DidDocument, ResolveError> {
        let response = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|source| ResolveError::Fetch {
                subject: did.to_string(),
                source,
            })?;

        if !response.status().is_success() {
            return Err(ResolveError::Status {
                subject: did.to_string(),
                status: response.status().as_u16(),
            });
        }

        response
            .json()
            .await
            .map_err(|_| ResolveError::Malformed(did.to_string()))
    }

    async fn cached_identity(&self, did: &str) -> Option<Identity> {
        let cache = self.cache.lock().await;
        let (at, identity) = cache.identities.get(did)?;
        (at.elapsed() < self.ttl).then(|| identity.clone())
    }

    async fn cached_handle(&self, handle: &str) -> Option<Option<String>> {
        let cache = self.cache.lock().await;
        let (at, did) = cache.handles.get(handle)?;
        (at.elapsed() < self.ttl).then(|| did.clone())
    }

    /// Drops everything cached, for a caller that knows an account moved.
    pub async fn invalidate_all(&self) {
        let mut cache = self.cache.lock().await;
        cache.identities.clear();
        cache.handles.clear();
    }

    /// Drops one DID and any handle pointing at it.
    pub async fn invalidate(&self, did: &str) {
        let mut cache = self.cache.lock().await;
        cache.identities.remove(did);
        cache
            .handles
            .retain(|_, (_, cached)| cached.as_deref() != Some(did));
    }
}

/// A handle as it is compared and cached: no leading `@`, lowercased.
///
/// Handles are case-insensitive and people type the `@`, so normalising once
/// keeps the cache from holding four entries for one account — and keeps the
/// confirmation step comparing like with like.
pub fn normalize_handle(handle: &str) -> String {
    handle.trim().trim_start_matches('@').to_lowercase()
}

/// Whether a string could be a handle at all.
///
/// Checked before any lookup, because a handle goes into a URL and a DNS name:
/// a value with a slash or a space would otherwise build a request somewhere
/// unintended.
pub fn is_plausible_handle(handle: &str) -> bool {
    !handle.is_empty()
        && handle.len() <= 253
        && handle.contains('.')
        && !handle.starts_with('.')
        && !handle.ends_with('.')
        && !handle.contains("..")
        && handle
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A handle becomes a DNS name and a URL, so anything that is not one must
    /// be rejected before it is interpolated into either.
    #[test]
    fn only_plausible_handles_are_looked_up() {
        for handle in ["alice.bsky.social", "rocksky.app", "a.b-c.example"] {
            assert!(is_plausible_handle(handle), "{handle}");
        }

        for handle in [
            "",
            "nodot",
            ".leading",
            "trailing.",
            "double..dot",
            "has space.com",
            "has/slash.com",
            "has:colon.com",
            // A path traversal into the well-known URL.
            "../../etc/passwd",
            // An attempt at a DNS label injection.
            "a.com\n_atproto.b.com",
        ] {
            assert!(!is_plausible_handle(handle), "{handle} was accepted");
        }
    }

    /// The URL a DID document is read from is method-specific, and a did:web
    /// with a port encodes the colon.
    #[test]
    fn a_document_url_is_built_per_method() {
        let resolver = Resolver::new(reqwest::Client::new());

        assert_eq!(
            resolver.document_url("did:plc:abc").unwrap(),
            "https://plc.directory/did:plc:abc"
        );
        assert_eq!(
            resolver.document_url("did:web:example.com").unwrap(),
            "https://example.com/.well-known/did.json"
        );
        assert_eq!(
            resolver.document_url("did:web:localhost%3A3000").unwrap(),
            "https://localhost:3000/.well-known/did.json"
        );

        assert!(matches!(
            resolver.document_url("did:key:z6Mk"),
            Err(ResolveError::UnsupportedMethod(_))
        ));
        assert!(resolver.document_url("not-a-did").is_err());
    }

    /// An edge cache for the PLC directory is the point of making it
    /// configurable — `apps/plc-proxy` exists for exactly this.
    #[test]
    fn the_plc_directory_is_configurable() {
        let resolver =
            Resolver::new(reqwest::Client::new()).plc_directory("https://plc.rocksky.app/");
        assert_eq!(
            resolver.document_url("did:plc:abc").unwrap(),
            "https://plc.rocksky.app/did:plc:abc"
        );
    }

    /// The cache has to expire, or a handle change is never seen.
    #[tokio::test]
    async fn a_cached_identity_expires() {
        let resolver = Resolver::new(reqwest::Client::new()).ttl(Duration::from_millis(30));
        let identity = Identity {
            did: "did:plc:abc".into(),
            handle: Some("alice.example".into()),
            pds: Some("https://pds.example".into()),
        };

        resolver
            .cache
            .lock()
            .await
            .identities
            .insert("did:plc:abc".into(), (Instant::now(), identity.clone()));

        assert_eq!(
            resolver.cached_identity("did:plc:abc").await,
            Some(identity)
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert_eq!(resolver.cached_identity("did:plc:abc").await, None);
    }

    /// Invalidating a DID must also drop the handle pointing at it, or the
    /// next lookup re-learns the stale pairing from the handle side.
    #[tokio::test]
    async fn invalidating_a_did_drops_its_handle_too() {
        let resolver = Resolver::new(reqwest::Client::new());
        {
            let mut cache = resolver.cache.lock().await;
            cache.identities.insert(
                "did:plc:abc".into(),
                (
                    Instant::now(),
                    Identity {
                        did: "did:plc:abc".into(),
                        handle: Some("alice.example".into()),
                        pds: None,
                    },
                ),
            );
            cache.handles.insert(
                "alice.example".into(),
                (Instant::now(), Some("did:plc:abc".into())),
            );
            cache.handles.insert(
                "bob.example".into(),
                (Instant::now(), Some("did:plc:other".into())),
            );
        }

        resolver.invalidate("did:plc:abc").await;

        let cache = resolver.cache.lock().await;
        assert!(!cache.identities.contains_key("did:plc:abc"));
        assert!(!cache.handles.contains_key("alice.example"));
        // Somebody else's pairing is untouched.
        assert!(cache.handles.contains_key("bob.example"));
    }
}

#[cfg(test)]
mod normalization {
    use super::*;

    /// The bug a live test caught: an `@` prefix resolved and was then
    /// refused, because the lookup normalised and the confirmation did not.
    #[test]
    fn a_handle_is_normalized_the_same_way_everywhere() {
        for typed in [
            "@RockSky.app",
            "rocksky.app",
            " ROCKSKY.APP ",
            "@rocksky.app",
        ] {
            assert_eq!(normalize_handle(typed), "rocksky.app", "{typed:?}");
        }
    }

    /// Normalisation must not make an implausible handle plausible.
    #[test]
    fn normalizing_does_not_launder_a_bad_handle() {
        assert!(!is_plausible_handle(&normalize_handle("@has space.com")));
        assert!(!is_plausible_handle(&normalize_handle("@nodot")));
        assert!(!is_plausible_handle(&normalize_handle("@../../etc/passwd")));
    }
}
