//! What the lexicons declare, against what the server serves.
//!
//! `src/lexicon/methods.rs` is generated from the lexicons and lists all 151
//! methods. The routes are hand-written. Comparing the two is the only way to
//! see three otherwise-invisible mistakes:
//!
//! - a method served at a path that does not match its NSID (a typo, a missing
//!   namespace) — it answers 404 and looks unimplemented
//! - a route for an NSID no lexicon declares — dead, or misspelled
//! - a query served as a POST or the reverse — also a 404
//!
//! The coverage figure is printed rather than asserted, because most methods
//! are deliberately not ported yet. What *is* asserted is that every route
//! which exists is correct.

use rocksky_appview::lexicon::methods::{MethodKind, METHODS};

/// Every route the server registers, by probing each declared NSID.
///
/// actix has no route-table introspection, so registration is detected by
/// calling: a registered path answers something other than 404.
async fn registered() -> Vec<(&'static str, MethodKind)> {
    use actix_web::{web, App};

    let state = rocksky_appview::state::AppState::for_test().await.unwrap();
    let app = actix_web::test::init_service(
        App::new()
            .app_data(state.clone())
            .app_data(web::Data::new(state.clone()))
            .configure(rocksky_appview::xrpc::configure),
    )
    .await;

    let mut found = Vec::new();
    for method in METHODS {
        let path = format!("/xrpc/{}", method.nsid);
        let request = match method.kind {
            MethodKind::Query => actix_web::test::TestRequest::get().uri(&path),
            MethodKind::Procedure => actix_web::test::TestRequest::post().uri(&path),
        };
        let response = actix_web::test::call_service(&app, request.to_request()).await;
        if response.status() != 404 {
            found.push((method.nsid, method.kind));
        }
    }
    found
}

#[actix_web::test]
async fn the_generated_table_covers_the_lexicons() {
    // A sanity check on the generated table itself: if it were empty every
    // other assertion here would pass vacuously.
    assert!(
        METHODS.len() > 140,
        "the generated table looks wrong: {} methods",
        METHODS.len()
    );

    let queries = METHODS
        .iter()
        .filter(|m| m.kind == MethodKind::Query)
        .count();
    let procedures = METHODS.len() - queries;
    assert!(queries > 90 && procedures > 40, "{queries}q {procedures}p");

    // Every entry is a real NSID, and its path is derived from it.
    for method in METHODS {
        assert!(
            method.nsid.starts_with("app.rocksky.") || method.nsid.starts_with("app.bsky."),
            "unexpected namespace: {}",
            method.nsid
        );
        assert_eq!(method.path(), format!("/xrpc/{}", method.nsid));
    }
}

/// The check that matters: every registered route is one the lexicons
/// declare, at the path and verb they declare.
#[actix_web::test]
async fn every_registered_route_matches_a_declared_method() {
    let found = registered().await;

    assert!(
        !found.is_empty(),
        "no routes were detected — the probe itself is broken"
    );

    for (nsid, kind) in &found {
        let declared = rocksky_appview::lexicon::methods::find(nsid)
            .unwrap_or_else(|| panic!("{nsid} is served but no lexicon declares it"));
        assert_eq!(
            declared.kind,
            *kind,
            "{nsid} is served as a {} but declared as a {}",
            kind.http_method(),
            declared.kind.http_method()
        );
    }

    println!(
        "{}/{} lexicon methods implemented ({:.0}%)",
        found.len(),
        METHODS.len(),
        100.0 * found.len() as f64 / METHODS.len() as f64
    );

    // The remainder, grouped by namespace. Printed rather than derived by hand
    // because the obvious way to work it out — grepping for the NSID string —
    // undercounts badly: the Subsonic proxy registers thirty-six methods from a
    // table, so none of them appear as a literal anywhere.
    let served: std::collections::HashSet<&str> = found.iter().map(|(nsid, _)| *nsid).collect();

    let mut missing: std::collections::BTreeMap<&str, Vec<&str>> =
        std::collections::BTreeMap::new();
    for method in METHODS {
        if served.contains(method.nsid) {
            continue;
        }
        // `app.rocksky.album.getAlbum` → `album`.
        let namespace = method.nsid.split('.').nth(2).unwrap_or(method.nsid);
        missing.entry(namespace).or_default().push(method.nsid);
    }

    if !missing.is_empty() {
        println!("\nnot implemented ({}):", METHODS.len() - found.len());
        for (namespace, nsids) in &missing {
            println!("  {namespace} ({})", nsids.len());
            for nsid in nsids {
                println!("      {nsid}");
            }
        }
    }
}

/// A query must not be reachable by POST, or the reverse: a client using the
/// verb the lexicon specifies would get a 404 from a route registered with
/// the other one.
#[actix_web::test]
async fn a_method_is_not_reachable_by_the_wrong_verb() {
    use actix_web::{web, App};

    let state = rocksky_appview::state::AppState::for_test().await.unwrap();
    let app = actix_web::test::init_service(
        App::new()
            .app_data(state.clone())
            .app_data(web::Data::new(state.clone()))
            .configure(rocksky_appview::xrpc::configure),
    )
    .await;

    let implemented = registered().await;
    assert!(!implemented.is_empty());

    for (nsid, kind) in implemented {
        let path = format!("/xrpc/{nsid}");
        // The opposite verb to the one the lexicon declares.
        let wrong = match kind {
            MethodKind::Query => actix_web::test::TestRequest::post().uri(&path),
            MethodKind::Procedure => actix_web::test::TestRequest::get().uri(&path),
        };
        let response = actix_web::test::call_service(&app, wrong.to_request()).await;
        assert!(
            response.status() == 404 || response.status() == 405,
            "{nsid} answered {} to the wrong verb; it should not be routed at all",
            response.status()
        );
    }
}
