//! Resolution against the real network.
//!
//! Gated on `ROCKSKY_LIVE_IDENTITY` rather than `#[ignore]`d, because an
//! ignored test is one nobody runs:
//!
//! ```sh
//! ROCKSKY_LIVE_IDENTITY=1 cargo test -p rocksky-identity --test live
//! ```
//!
//! These assert on accounts that exist rather than on fixtures, which is the
//! point: the shape of a real DID document and the two handle-resolution paths
//! are what this crate is for, and a fixture can only prove it parses what I
//! expected it to receive.

use rocksky_identity::{ResolveError, Resolver};

fn enabled() -> bool {
    std::env::var("ROCKSKY_LIVE_IDENTITY").is_ok_and(|v| !v.is_empty())
}

fn resolver() -> Resolver {
    Resolver::new(reqwest::Client::new())
}

/// The account this repository's feeds are published from.
const ROCKSKY_DID: &str = "did:plc:vegqomyce4ssoqs7zwqvgqty";
const ROCKSKY_HANDLE: &str = "rocksky.app";

#[tokio::test]
async fn a_did_resolves_to_its_handle_and_pds() {
    if !enabled() {
        return;
    }

    let identity = resolver().resolve_did(ROCKSKY_DID).await.unwrap();

    assert_eq!(identity.did, ROCKSKY_DID);
    assert_eq!(identity.handle.as_deref(), Some(ROCKSKY_HANDLE));

    let pds = identity.pds.expect("an account has a PDS");
    assert!(pds.starts_with("https://"), "{pds}");
    assert!(!pds.ends_with('/'), "the trailing slash is trimmed: {pds}");
}

/// The other direction, and the reason the crate exists.
#[tokio::test]
async fn a_handle_resolves_back_to_the_same_did() {
    if !enabled() {
        return;
    }

    let resolver = resolver();
    let claimed = resolver
        .resolve_handle_unverified(ROCKSKY_HANDLE)
        .await
        .unwrap();
    assert_eq!(claimed.as_deref(), Some(ROCKSKY_DID));

    // And the verified path agrees, which means the DID document confirmed it.
    let identity = resolver.resolve(ROCKSKY_HANDLE).await.unwrap();
    assert_eq!(identity.did, ROCKSKY_DID);
}

/// `resolve` takes either spelling, which is what every "actor" parameter in
/// the API needs.
#[tokio::test]
async fn resolve_accepts_a_did_or_a_handle() {
    if !enabled() {
        return;
    }

    let resolver = resolver();
    let by_did = resolver.resolve(ROCKSKY_DID).await.unwrap();
    let by_handle = resolver.resolve(ROCKSKY_HANDLE).await.unwrap();
    assert_eq!(by_did, by_handle);

    // Leading @ and odd case are what a person types.
    let typed = resolver.resolve("@RockSky.app").await.unwrap();
    assert_eq!(typed.did, ROCKSKY_DID);
}

/// A handle nobody has must not resolve to somebody.
#[tokio::test]
async fn an_unknown_handle_does_not_resolve() {
    if !enabled() {
        return;
    }

    let resolver = resolver();
    let missing = "this-handle-does-not-exist.rocksky-test.invalid";

    assert_eq!(
        resolver.resolve_handle_unverified(missing).await.unwrap(),
        None
    );
    assert!(matches!(
        resolver.resolve(missing).await,
        Err(ResolveError::UnresolvableHandle(_))
    ));
}

/// The second lookup comes from the cache, so it is much faster — and more
/// importantly, it happens at all rather than hitting the directory again for
/// every row of a fifty-scrobble page.
#[tokio::test]
async fn the_second_lookup_is_cached() {
    if !enabled() {
        return;
    }

    let resolver = resolver();

    let cold = std::time::Instant::now();
    resolver.resolve_did(ROCKSKY_DID).await.unwrap();
    let cold = cold.elapsed();

    let warm = std::time::Instant::now();
    resolver.resolve_did(ROCKSKY_DID).await.unwrap();
    let warm = warm.elapsed();

    assert!(
        warm < cold / 5,
        "the second lookup was not cached: cold {cold:?}, warm {warm:?}"
    );

    // And invalidation puts it back to a real lookup.
    resolver.invalidate(ROCKSKY_DID).await;
    let again = std::time::Instant::now();
    resolver.resolve_did(ROCKSKY_DID).await.unwrap();
    assert!(
        again.elapsed() > warm,
        "invalidation did not clear the entry"
    );
}
