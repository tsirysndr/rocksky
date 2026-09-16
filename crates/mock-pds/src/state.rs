//! Everything the mock knows, held in one place behind one lock.
//!
//! A real PDS keeps accounts, repositories and revisions on disk. Here they
//! live in a `Mutex` for the lifetime of a test, which is what makes the mock
//! fast: starting one costs a loopback bind and nothing else — no container,
//! no migration, no fixture file read at run time.
//!
//! The lock is `std::sync::Mutex` rather than tokio's on purpose. Every
//! handler takes it, does a map lookup or insert, and drops it; nothing awaits
//! while holding it, so an async-aware lock would only add overhead and the
//! possibility of a handler holding it across a yield.

use std::collections::BTreeMap;
use std::collections::HashMap;
use std::sync::Mutex;

/// An account that can sign in.
#[derive(Debug, Clone)]
pub struct Account {
    pub did: String,
    pub handle: String,
    /// The app password `com.atproto.server.createSession` accepts.
    pub password: String,
    /// What `app.bsky.actor.getProfile` answers.
    pub profile: serde_json::Value,
    pub access_jwt: String,
    pub refresh_jwt: String,
}

impl Account {
    pub fn new(did: impl Into<String>, handle: impl Into<String>, password: impl Into<String>) -> Self {
        let did = did.into();
        let handle = handle.into();
        Self {
            profile: serde_json::json!({
                "did": did,
                "handle": handle,
                "displayName": handle,
            }),
            // Distinct per account, so a test that mixes up two sessions sees
            // it rather than having one token happen to work for both.
            access_jwt: format!("mock-access-{did}"),
            refresh_jwt: format!("mock-refresh-{did}"),
            did,
            handle,
            password: password.into(),
        }
    }
}

/// One record as the repository holds it.
#[derive(Debug, Clone)]
pub struct StoredRecord {
    pub collection: String,
    pub rkey: String,
    pub value: serde_json::Value,
}

/// A request the mock served, for tests that assert on what was called.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Call {
    pub method: String,
    /// Path only — no query string, so assertions do not depend on parameter
    /// order.
    pub path: String,
}

impl std::fmt::Display for Call {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} {}", self.method, self.path)
    }
}

/// A queued failure, so a test can drive the unhappy path.
#[derive(Debug, Clone)]
pub struct Failure {
    pub status: u16,
    pub error: String,
    pub message: String,
    /// How many more requests this applies to. `None` means every one.
    pub remaining: Option<usize>,
}

#[derive(Default)]
pub struct Inner {
    /// Where the mock is reachable, learnt once it has bound a port. The DID
    /// document has to advertise it, so it cannot be known before then.
    pub base_url: String,
    pub accounts: Vec<Account>,
    /// Records by DID, sorted by `(collection, rkey)` so a repository has the
    /// deterministic order the MST wants.
    pub repos: HashMap<String, BTreeMap<(String, String), serde_json::Value>>,
    /// DID documents that override the generated one, for accounts imported
    /// from a real repository.
    pub did_documents: HashMap<String, serde_json::Value>,
    pub calls: Vec<Call>,
    pub failures: HashMap<String, Failure>,
    /// Bumped on every write, and used as the commit `rev`.
    pub revision: u64,
}

pub struct State(pub Mutex<Inner>);

impl State {
    pub fn new(inner: Inner) -> Self {
        Self(Mutex::new(inner))
    }

    /// A poisoned lock means a handler panicked while holding it. Recovering
    /// rather than propagating keeps one failing assertion from turning every
    /// later request in the test into a second, unrelated panic.
    pub fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn record_call(&self, method: &str, path: &str) {
        self.lock().calls.push(Call {
            method: method.to_string(),
            path: path.to_string(),
        });
    }

    /// Takes the queued failure for `nsid`, if one is due.
    pub fn take_failure(&self, nsid: &str) -> Option<Failure> {
        let mut inner = self.lock();
        let failure = inner.failures.get_mut(nsid)?;

        let taken = failure.clone();
        match &mut failure.remaining {
            None => Some(taken),
            Some(0) => None,
            Some(remaining) => {
                *remaining -= 1;
                let exhausted = *remaining == 0;
                if exhausted {
                    inner.failures.remove(nsid);
                }
                Some(taken)
            }
        }
    }

    pub fn account(&self, did_or_handle: &str) -> Option<Account> {
        let inner = self.lock();
        inner
            .accounts
            .iter()
            .find(|account| account.did == did_or_handle || account.handle == did_or_handle)
            .cloned()
    }

    /// The account a bearer token belongs to.
    ///
    /// Matched against both tokens because `refreshSession` presents the
    /// refresh one where every other call presents the access one.
    pub fn account_for_token(&self, token: &str) -> Option<Account> {
        let inner = self.lock();
        inner
            .accounts
            .iter()
            .find(|account| account.access_jwt == token || account.refresh_jwt == token)
            .cloned()
    }

    pub fn put_record(
        &self,
        did: &str,
        collection: &str,
        rkey: &str,
        value: serde_json::Value,
    ) {
        let mut inner = self.lock();
        inner.revision += 1;
        inner
            .repos
            .entry(did.to_string())
            .or_default()
            .insert((collection.to_string(), rkey.to_string()), value);
    }

    pub fn delete_record(&self, did: &str, collection: &str, rkey: &str) -> bool {
        let mut inner = self.lock();
        inner.revision += 1;
        inner
            .repos
            .get_mut(did)
            .and_then(|repo| repo.remove(&(collection.to_string(), rkey.to_string())))
            .is_some()
    }

    pub fn get_record(
        &self,
        did: &str,
        collection: &str,
        rkey: &str,
    ) -> Option<serde_json::Value> {
        let inner = self.lock();
        inner
            .repos
            .get(did)?
            .get(&(collection.to_string(), rkey.to_string()))
            .cloned()
    }

    /// Every record in a repository, or just one collection's worth.
    pub fn records(&self, did: &str, collection: Option<&str>) -> Vec<StoredRecord> {
        let inner = self.lock();
        let Some(repo) = inner.repos.get(did) else {
            return Vec::new();
        };
        repo.iter()
            .filter(|((c, _), _)| collection.is_none_or(|wanted| c == wanted))
            .map(|((c, rkey), value)| StoredRecord {
                collection: c.clone(),
                rkey: rkey.clone(),
                value: value.clone(),
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> State {
        let mut inner = Inner::default();
        inner.accounts.push(Account::new(
            "did:plc:alice",
            "alice.test",
            "app-password",
        ));
        State::new(inner)
    }

    #[test]
    fn records_come_back_sorted_by_collection_then_rkey() {
        let state = state();
        // Inserted out of order on purpose.
        state.put_record("did:plc:alice", "app.rocksky.song", "3bbb", serde_json::json!({}));
        state.put_record("did:plc:alice", "app.rocksky.album", "3aaa", serde_json::json!({}));
        state.put_record("did:plc:alice", "app.rocksky.song", "3aaa", serde_json::json!({}));

        let keys: Vec<String> = state
            .records("did:plc:alice", None)
            .iter()
            .map(|r| format!("{}/{}", r.collection, r.rkey))
            .collect();

        assert_eq!(
            keys,
            [
                "app.rocksky.album/3aaa",
                "app.rocksky.song/3aaa",
                "app.rocksky.song/3bbb",
            ]
        );
    }

    #[test]
    fn a_collection_filter_narrows_the_listing() {
        let state = state();
        state.put_record("did:plc:alice", "app.rocksky.song", "3aaa", serde_json::json!({}));
        state.put_record("did:plc:alice", "app.rocksky.album", "3bbb", serde_json::json!({}));

        let songs = state.records("did:plc:alice", Some("app.rocksky.song"));
        assert_eq!(songs.len(), 1);
        assert_eq!(songs[0].rkey, "3aaa");
    }

    /// `putRecord` is an upsert, which is what makes republishing the same
    /// rkey idempotent.
    #[test]
    fn putting_the_same_key_twice_replaces_it() {
        let state = state();
        state.put_record("did:plc:alice", "app.rocksky.song", "3aaa", serde_json::json!({"v": 1}));
        state.put_record("did:plc:alice", "app.rocksky.song", "3aaa", serde_json::json!({"v": 2}));

        let songs = state.records("did:plc:alice", None);
        assert_eq!(songs.len(), 1);
        assert_eq!(songs[0].value["v"], 2);
    }

    #[test]
    fn deleting_reports_whether_anything_was_there() {
        let state = state();
        state.put_record("did:plc:alice", "app.rocksky.song", "3aaa", serde_json::json!({}));

        assert!(state.delete_record("did:plc:alice", "app.rocksky.song", "3aaa"));
        assert!(!state.delete_record("did:plc:alice", "app.rocksky.song", "3aaa"));
        assert!(state.records("did:plc:alice", None).is_empty());
    }

    /// Every write moves the revision, so a consumer can tell that a repo
    /// changed.
    #[test]
    fn writes_advance_the_revision() {
        let state = state();
        let before = state.lock().revision;

        state.put_record("did:plc:alice", "app.rocksky.song", "3aaa", serde_json::json!({}));
        let after_put = state.lock().revision;
        assert!(after_put > before);

        state.delete_record("did:plc:alice", "app.rocksky.song", "3aaa");
        assert!(state.lock().revision > after_put);
    }

    #[test]
    fn an_account_is_found_by_did_or_handle() {
        let state = state();
        assert!(state.account("did:plc:alice").is_some());
        assert!(state.account("alice.test").is_some());
        assert!(state.account("did:plc:nobody").is_none());
    }

    /// Both tokens resolve, because `refreshSession` presents the refresh one.
    #[test]
    fn either_token_identifies_the_account() {
        let state = state();
        let account = state.account("did:plc:alice").unwrap();

        assert_eq!(
            state.account_for_token(&account.access_jwt).unwrap().did,
            "did:plc:alice"
        );
        assert_eq!(
            state.account_for_token(&account.refresh_jwt).unwrap().did,
            "did:plc:alice"
        );
        assert!(state.account_for_token("not-a-token").is_none());
    }

    /// A counted failure fires that many times and then stops, so a test can
    /// check that a retry succeeds.
    #[test]
    fn a_counted_failure_expires() {
        let state = state();
        state.lock().failures.insert(
            "com.atproto.repo.putRecord".to_string(),
            Failure {
                status: 502,
                error: "UpstreamFailure".into(),
                message: "nope".into(),
                remaining: Some(2),
            },
        );

        assert!(state.take_failure("com.atproto.repo.putRecord").is_some());
        assert!(state.take_failure("com.atproto.repo.putRecord").is_some());
        assert!(
            state.take_failure("com.atproto.repo.putRecord").is_none(),
            "the third call succeeds"
        );
    }

    /// An uncounted one keeps firing, for testing a PDS that is simply down.
    #[test]
    fn an_uncounted_failure_persists() {
        let state = state();
        state.lock().failures.insert(
            "com.atproto.repo.putRecord".to_string(),
            Failure {
                status: 500,
                error: "InternalServerError".into(),
                message: "down".into(),
                remaining: None,
            },
        );

        for _ in 0..5 {
            assert!(state.take_failure("com.atproto.repo.putRecord").is_some());
        }
    }

    /// A panic in one handler must not poison the mock for the rest of the
    /// test, or one failure would cascade into unrelated ones.
    #[test]
    fn a_poisoned_lock_still_opens() {
        let state = std::sync::Arc::new(state());

        let poisoner = std::sync::Arc::clone(&state);
        let _ = std::thread::spawn(move || {
            let _guard = poisoner.lock();
            panic!("a handler failed while holding the lock");
        })
        .join();

        assert!(state.0.is_poisoned());
        assert_eq!(state.lock().accounts.len(), 1, "still readable");
    }
}
