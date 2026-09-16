//! An in-memory ATProto PDS for tests.
//!
//! # What this replaces
//!
//! Testing anything that talks to a PDS used to mean one of three bad options:
//! hand-roll a stub `HttpServer` in each test file (the appview had two, with
//! overlapping endpoints and different bugs), stand up a container, or point
//! at the real network and accept a slow, flaky, unrepeatable test. This is
//! one dependency that covers all of it:
//!
//! ```no_run
//! # async fn example() {
//! use rocksky_mock_pds::MockPds;
//!
//! let pds = MockPds::start().await;
//!
//! // One base URL stands in for the PLC directory, the Bluesky appview, the
//! // PDS and its OAuth server, so every setting points at the same place.
//! let url = pds.url();
//! let did = pds.did();
//! # }
//! ```
//!
//! Starting one costs a loopback bind — roughly a millisecond — so a test can
//! have its own rather than sharing global state with every other test.
//!
//! # What it serves
//!
//! | endpoint                                  | stands in for                  |
//! |-------------------------------------------|--------------------------------|
//! | `GET /{did}`                              | the PLC directory              |
//! | `com.atproto.identity.resolveHandle`      | handle resolution              |
//! | `GET /.well-known/atproto-did`            | DNS-free handle verification   |
//! | `app.bsky.actor.getProfile`               | the Bluesky appview            |
//! | `com.atproto.server.createSession`        | app-password login             |
//! | `com.atproto.server.refreshSession`       | session refresh                |
//! | `com.atproto.server.getSession`           | session check                  |
//! | `com.atproto.repo.putRecord`              | publishing a record            |
//! | `com.atproto.repo.createRecord`           | publishing with a server rkey  |
//! | `com.atproto.repo.getRecord`              | reading one record             |
//! | `com.atproto.repo.listRecords`            | paging a collection            |
//! | `com.atproto.repo.deleteRecord`           | removing a record              |
//! | `com.atproto.repo.describeRepo`           | what a repo holds              |
//! | `com.atproto.sync.getRepo`                | the whole repo, as a real CAR  |
//! | `com.atproto.sync.getLatestCommit`         | the current commit             |
//! | `/.well-known/oauth-authorization-server` | OAuth metadata discovery       |
//! | `/oauth/par`, `/authorize`, `/token`, `/revoke` | the OAuth handshake       |
//!
//! # What it does not do
//!
//! Worth knowing before trusting a passing test:
//!
//! - **No signatures.** The commit block carries a `sig` field of the right
//!   shape filled with zeros. A consumer that verifies commit signatures will
//!   reject the archive, and is right to.
//! - **No lexicon validation.** A record is stored exactly as sent. A real PDS
//!   with `validate: true` rejects unknown fields and a `null` where the
//!   lexicon says optional-absent; the mock does not, so a test that cares
//!   about record shape must assert on the stored value.
//! - **No DPoP or PKCE checks.** The OAuth endpoints accept whatever they are
//!   sent. They test that a client reaches them with the right shape, not that
//!   its proofs are valid.
//! - **No token rotation.** `refreshSession` returns the same tokens, so one
//!   token works for a whole test.
//!
//! The CAR and the MST, by contrast, are built for real — see [`car`] and
//! [`mst`]. That is the part where a permissive mock would hide actual bugs.

pub mod car;
pub mod mst;
pub mod routes;
pub mod state;

use actix_web::{web, App, HttpServer};
use state::{Account, Failure, Inner, State};
use std::sync::Arc;

/// The repository baked into this crate, captured from production.
///
/// `oops.wtf` is a real Rocksky listener; this is a slice of their repo — 54
/// records across scrobbles, songs, albums, artists, likes and shouts, plus
/// their real DID document and profile. Fixture data beats invented data here
/// because real records carry the things a hand-written one never does: nulls
/// where a field was absent, unicode in titles, `artists` sub-arrays, ISRCs
/// and MBIDs, and album titles like `Now That's What I Call Music 66 - CD 2`
/// that break naive parsing.
///
/// Compiled in, so loading it is a parse and not a file read.
const PRODUCTION_FIXTURE: &str = include_str!("../fixtures/oops.wtf.json");

/// Encodes a revision counter as a TID-shaped string.
///
/// Not a real TID — a real one is a timestamp in base32-sortable — but the
/// same 13 characters from the same alphabet, and monotonic, which is what
/// consumers rely on.
pub fn tid(revision: u64) -> String {
    const ALPHABET: &[u8] = b"234567abcdefghijklmnopqrstuvwxyz";
    let mut value = revision;
    let mut out = [b'2'; 13];
    for slot in out.iter_mut().rev() {
        *slot = ALPHABET[(value % 32) as usize];
        value /= 32;
    }
    String::from_utf8(out.to_vec()).expect("the alphabet is ASCII")
}

/// A running mock. Stops when dropped.
pub struct MockPds {
    base_url: String,
    state: Arc<State>,
    handle: actix_web::dev::ServerHandle,
}

/// Configures a mock before it starts.
pub struct MockPdsBuilder {
    accounts: Vec<Account>,
    repos: Vec<(String, String, String, serde_json::Value)>,
    did_documents: Vec<(String, serde_json::Value)>,
}

impl Default for MockPdsBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl MockPdsBuilder {
    pub fn new() -> Self {
        Self {
            accounts: Vec::new(),
            repos: Vec::new(),
            did_documents: Vec::new(),
        }
    }

    /// Adds an account that can sign in with `password`.
    pub fn account(
        mut self,
        did: impl Into<String>,
        handle: impl Into<String>,
        password: impl Into<String>,
    ) -> Self {
        self.accounts.push(Account::new(did, handle, password));
        self
    }

    /// Overrides an account's `app.bsky.actor.getProfile` answer.
    pub fn profile(mut self, did: &str, profile: serde_json::Value) -> Self {
        if let Some(account) = self.accounts.iter_mut().find(|a| a.did == did) {
            account.profile = profile;
        }
        self
    }

    /// Seeds a record into an account's repository.
    pub fn record(
        mut self,
        did: impl Into<String>,
        collection: impl Into<String>,
        rkey: impl Into<String>,
        value: serde_json::Value,
    ) -> Self {
        self.repos.push((
            did.into(),
            collection.into(),
            rkey.into(),
            value,
        ));
        self
    }

    /// Loads the production fixture: a real account with a real repository.
    ///
    /// The account's password is set to `password`, since the captured data
    /// naturally does not include one.
    pub fn production_fixture(mut self, password: impl Into<String>) -> Self {
        let fixture: serde_json::Value =
            serde_json::from_str(PRODUCTION_FIXTURE).expect("the bundled fixture parses");

        let did = fixture["did"].as_str().expect("the fixture names a DID");
        let handle = fixture["profile"]["handle"]
            .as_str()
            .expect("the fixture has a profile");

        self = self.account(did, handle, password);
        self.accounts
            .last_mut()
            .expect("just pushed")
            .profile = fixture["profile"].clone();

        // The document is kept as captured, except for its service endpoint:
        // the original points at a real bsky.network host, and a test that
        // followed it would leave the machine.
        if let Some(document) = fixture.get("did_document") {
            let mut document = document.clone();
            document["service"] = serde_json::json!([{
                "id": "#atproto_pds",
                "type": "AtprotoPersonalDataServer",
                "serviceEndpoint": "http://127.0.0.1:0",
            }]);
            self.did_documents.push((did.to_string(), document));
        }

        if let Some(collections) = fixture["collections"].as_object() {
            for (collection, records) in collections {
                for record in records.as_array().into_iter().flatten() {
                    let Some(rkey) = record["rkey"].as_str() else {
                        continue;
                    };
                    self.repos.push((
                        did.to_string(),
                        collection.clone(),
                        rkey.to_string(),
                        record["value"].clone(),
                    ));
                }
            }
        }

        self
    }

    /// Binds a port and starts serving.
    pub async fn start(self) -> MockPds {
        // Bound before the server is built, because the DID document has to
        // advertise the address and cannot know it any earlier.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind a loopback port");
        let port = listener
            .local_addr()
            .expect("a bound listener has an address")
            .port();
        let base_url = format!("http://127.0.0.1:{port}");

        let mut inner = Inner {
            base_url: base_url.clone(),
            ..Inner::default()
        };

        // A mock with no configured account still has one, so the common case
        // needs no setup.
        inner.accounts = if self.accounts.is_empty() {
            vec![Account::new(
                "did:plc:mockpdstestaccount",
                "mock.test",
                "mock-app-password",
            )]
        } else {
            self.accounts
        };

        for (did, collection, rkey, value) in self.repos {
            inner
                .repos
                .entry(did)
                .or_default()
                .insert((collection, rkey), value);
        }

        for (did, mut document) in self.did_documents {
            // Now that the port is known, point the imported document here.
            document["service"] = serde_json::json!([{
                "id": "#atproto_pds",
                "type": "AtprotoPersonalDataServer",
                "serviceEndpoint": base_url,
            }]);
            inner.did_documents.insert(did, document);
        }

        let state = Arc::new(State::new(inner));
        let data = web::Data::from(Arc::clone(&state));

        let server = HttpServer::new(move || {
            App::new()
                .app_data(data.clone())
                // One worker: a test does not need parallelism, and a single
                // worker makes the request log deterministic.
                .configure(routes::configure)
        })
        .workers(1)
        .listen(listener)
        .expect("serve on the bound listener")
        .run();

        let handle = server.handle();
        tokio::spawn(server);

        MockPds {
            base_url,
            state,
            handle,
        }
    }
}

impl MockPds {
    /// Starts a mock with one account and an empty repository.
    pub async fn start() -> Self {
        MockPdsBuilder::new().start().await
    }

    /// Starts a mock holding the production fixture. See
    /// [`MockPdsBuilder::production_fixture`].
    pub async fn with_production_data() -> Self {
        MockPdsBuilder::new()
            .production_fixture("mock-app-password")
            .start()
            .await
    }

    pub fn builder() -> MockPdsBuilder {
        MockPdsBuilder::new()
    }

    /// Where the mock is listening. Point `plc_directory_url`,
    /// `bsky_appview_url` and any PDS setting at this.
    pub fn url(&self) -> &str {
        &self.base_url
    }

    /// The first account's DID.
    pub fn did(&self) -> String {
        self.state
            .lock()
            .accounts
            .first()
            .map(|account| account.did.clone())
            .unwrap_or_default()
    }

    pub fn handle(&self) -> String {
        self.state
            .lock()
            .accounts
            .first()
            .map(|account| account.handle.clone())
            .unwrap_or_default()
    }

    /// The first account's app password.
    pub fn password(&self) -> String {
        self.state
            .lock()
            .accounts
            .first()
            .map(|account| account.password.clone())
            .unwrap_or_default()
    }

    /// The access token `createSession` hands out, for tests that skip login.
    pub fn access_token(&self) -> String {
        self.state
            .lock()
            .accounts
            .first()
            .map(|account| account.access_jwt.clone())
            .unwrap_or_default()
    }

    /// Records in the first account's repository, optionally one collection.
    pub fn records(&self, collection: Option<&str>) -> Vec<state::StoredRecord> {
        self.state.records(&self.did(), collection)
    }

    /// How many records a collection holds.
    pub fn record_count(&self, collection: &str) -> usize {
        self.records(Some(collection)).len()
    }

    /// Writes a record directly, without going through HTTP.
    pub fn put_record(&self, collection: &str, rkey: &str, value: serde_json::Value) {
        self.state.put_record(&self.did(), collection, rkey, value);
    }

    /// Every request served, in order, as `"METHOD /path"`.
    pub fn calls(&self) -> Vec<String> {
        self.state
            .lock()
            .calls
            .iter()
            .map(ToString::to_string)
            .collect()
    }

    /// Whether an endpoint was called at all.
    pub fn was_called(&self, path: &str) -> bool {
        self.state.lock().calls.iter().any(|call| call.path == path)
    }

    /// How many times an endpoint was called — for asserting that something
    /// was cached, or that a retry happened.
    pub fn call_count(&self, path: &str) -> usize {
        self.state
            .lock()
            .calls
            .iter()
            .filter(|call| call.path == path)
            .count()
    }

    pub fn clear_calls(&self) {
        self.state.lock().calls.clear();
    }

    /// Makes the next `times` calls to `nsid` fail.
    ///
    /// `nsid` is the method name without the `/xrpc/` prefix, e.g.
    /// `com.atproto.repo.putRecord`; the OAuth endpoints use `oauth.par`,
    /// `oauth.token` and `oauth.revoke`.
    pub fn fail_next(&self, nsid: &str, times: usize, status: u16, error: &str) {
        self.state.lock().failures.insert(
            nsid.to_string(),
            Failure {
                status,
                error: error.to_string(),
                message: format!("{error} (injected by the mock)"),
                remaining: Some(times),
            },
        );
    }

    /// Makes every call to `nsid` fail until [`MockPds::clear_failures`].
    pub fn always_fail(&self, nsid: &str, status: u16, error: &str) {
        self.state.lock().failures.insert(
            nsid.to_string(),
            Failure {
                status,
                error: error.to_string(),
                message: format!("{error} (injected by the mock)"),
                remaining: None,
            },
        );
    }

    pub fn clear_failures(&self) {
        self.state.lock().failures.clear();
    }
}

impl Drop for MockPds {
    fn drop(&mut self) {
        // `stop` is async; the handle's future only needs to be started, and
        // the runtime will finish it. Not awaiting here is what lets `MockPds`
        // be dropped from a sync context.
        let handle = self.handle.clone();
        tokio::spawn(async move { handle.stop(false).await });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tid_is_thirteen_characters_from_the_sortable_alphabet() {
        let tid = tid(1);
        assert_eq!(tid.len(), 13);
        assert!(tid.bytes().all(|b| b"234567abcdefghijklmnopqrstuvwxyz".contains(&b)));
    }

    /// Monotonic, because consumers order commits by `rev` as a string.
    #[test]
    fn tids_sort_in_revision_order() {
        let mut previous = tid(0);
        for revision in 1..500 {
            let current = tid(revision);
            assert!(current > previous, "{current} !> {previous}");
            previous = current;
        }
    }

    /// The bundled fixture has to parse and carry what the loader expects, or
    /// every test using it fails with something unhelpful.
    #[test]
    fn the_production_fixture_is_well_formed() {
        let fixture: serde_json::Value = serde_json::from_str(PRODUCTION_FIXTURE).unwrap();

        assert!(fixture["did"].as_str().unwrap().starts_with("did:plc:"));
        assert!(fixture["profile"]["handle"].as_str().is_some());
        assert_eq!(
            fixture["did_document"]["id"], fixture["did"],
            "the document describes the account"
        );

        let collections = fixture["collections"].as_object().unwrap();
        assert!(
            collections.contains_key("app.rocksky.scrobble"),
            "the point of the fixture is real scrobbles"
        );

        // Every record needs an rkey to be addressable.
        for (collection, records) in collections {
            let records = records.as_array().unwrap();
            assert!(!records.is_empty(), "{collection} is empty");
            for record in records {
                assert!(
                    record["rkey"].as_str().is_some_and(|rkey| !rkey.is_empty()),
                    "a {collection} record has no rkey"
                );
                assert!(
                    record["value"]["$type"].as_str() == Some(collection.as_str()),
                    "a {collection} record's $type disagrees with its collection"
                );
            }
        }
    }
}
