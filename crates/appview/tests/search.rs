//! The search index, against a real Typesense.
//!
//! These tests need a server, so they are gated on `ROCKSKY_TYPESENSE_URL`
//! rather than `#[ignore]`d: an ignored test is one nobody runs, whereas an
//! environment-gated one runs in any setup that has the dependency — including
//! the docker-compose file, where it is always present.
//!
//! ```sh
//! docker run -d -p 8109:8108 -v /tmp/ts:/data typesense/typesense:27.1 \
//!   --data-dir=/data --api-key=rocksky
//! ROCKSKY_TYPESENSE_URL=http://127.0.0.1:8109 cargo test --release -p rocksky-appview --test search
//! ```
//!
//! Every test prefixes its documents with its own name, so they can run
//! concurrently against one server without seeing each other's data — the
//! alternative, dropping the collections between tests, would make the suite
//! order-dependent.

use rocksky_appview::db::models;
use rocksky_appview::search::{self, Search};

/// The server to test against, or `None` to skip.
fn configured() -> Option<String> {
    std::env::var("ROCKSKY_TYPESENSE_URL")
        .ok()
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty())
}

fn api_key() -> String {
    std::env::var("ROCKSKY_TYPESENSE_API_KEY").unwrap_or_else(|_| "rocksky".to_string())
}

/// Connects and makes sure the collections exist.
///
/// Returns `None` when there is no server, which every test treats as a skip.
async fn connect() -> Option<Search> {
    let url = configured()?;
    let search = Search::connect(&url, &api_key())
        .await
        .expect("ROCKSKY_TYPESENSE_URL is set but unreachable");
    search
        .ensure_collections()
        .await
        .expect("could not create the collections");
    Some(search)
}

fn track(id: &str, title: &str, artist: &str, album: &str) -> models::Track {
    models::Track {
        id: id.into(),
        title: title.into(),
        artist: artist.into(),
        album_artist: artist.into(),
        album_art: None,
        album: album.into(),
        track_number: Some(1),
        duration: 120_000,
        mb_id: None,
        isrc: None,
        youtube_link: None,
        spotify_link: None,
        apple_music_link: None,
        tidal_link: None,
        sha256: id.into(),
        disc_number: Some(1),
        lyrics: None,
        composer: None,
        genre: None,
        label: None,
        copyright_message: None,
        key: None,
        bpm: None,
        uri: Some(format!("at://did:plc:test/app.rocksky.song/{id}")),
        album_uri: None,
        artist_uri: None,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        xata_version: Some(0),
    }
}

/// The whole round trip: create the collections, index a document, find it.
#[tokio::test]
async fn a_document_is_indexed_and_found() {
    let Some(search) = connect().await else {
        eprintln!("skipping: ROCKSKY_TYPESENSE_URL is not set");
        return;
    };

    let row = track(
        "roundtrip-1",
        "Roundtrip Roygbiv",
        "Roundtrip Canada",
        "Roundtrip Children",
    );
    search
        .index(search::TRACKS, &[search::track_doc(&row)])
        .await
        .expect("indexing must succeed");

    let results = search
        .federated("Roundtrip Roygbiv", 10)
        .await
        .expect("searching must succeed");

    let hit = results
        .hits
        .iter()
        .find(|hit| hit["id"] == "roundtrip-1")
        .unwrap_or_else(|| panic!("the document was not found: {:?}", results.hits));

    // The tag the client discriminates on.
    assert_eq!(hit["_federation"]["indexUid"], "tracks");

    // And the keys it reads, back out of the index unchanged.
    assert_eq!(hit["title"], "Roundtrip Roygbiv");
    assert_eq!(hit["albumArtist"], "Roundtrip Canada");
    assert!(
        hit.get("album_artist").is_none(),
        "snake_case would be unreadable to the client: {hit}"
    );

    assert!(results.estimated_total_hits >= 1);
}

/// The collections must be creatable twice — every restart does it.
#[tokio::test]
async fn ensuring_the_collections_is_idempotent() {
    let Some(search) = connect().await else {
        return;
    };

    // `connect` already ran it once, so this call must find everything and
    // create nothing. A second `POST /collections` would be a 409.
    let created = search
        .ensure_collections()
        .await
        .expect("a second pass must not fail");
    assert!(
        created.is_empty(),
        "nothing should have been created the second time: {created:?}"
    );
}

/// A search across all five collections returns each hit tagged with its own.
#[tokio::test]
async fn a_search_spans_every_collection() {
    let Some(search) = connect().await else {
        return;
    };

    // One matching document per collection, all sharing a nonsense term so
    // nothing else in the index can match it.
    let term = "Zyxwvu";

    search
        .index(
            search::TRACKS,
            &[search::track_doc(&track(
                "span-track",
                &format!("{term} Song"),
                "Span Artist",
                "Span Album",
            ))],
        )
        .await
        .unwrap();

    search
        .index(
            search::ALBUMS,
            &[serde_json::json!({
                "id": "span-album",
                "title": format!("{term} Album"),
                "artist": "Span Artist",
            })],
        )
        .await
        .unwrap();

    search
        .index(
            search::ARTISTS,
            &[serde_json::json!({ "id": "span-artist", "name": format!("{term} Artist") })],
        )
        .await
        .unwrap();

    search
        .index(
            search::USERS,
            &[serde_json::json!({
                "id": "span-user",
                "did": "did:plc:span",
                "handle": format!("{}.example.com", term.to_lowercase()),
                "displayName": format!("{term} Person"),
                "avatar": "https://example.com/a.jpg",
            })],
        )
        .await
        .unwrap();

    search
        .index(
            search::PLAYLISTS,
            &[serde_json::json!({ "id": "span-playlist", "name": format!("{term} Mix") })],
        )
        .await
        .unwrap();

    let results = search.federated(term, 20).await.unwrap();

    let found: std::collections::HashSet<&str> = results
        .hits
        .iter()
        .filter_map(|hit| hit["_federation"]["indexUid"].as_str())
        .collect();

    for collection in search::FEDERATED {
        assert!(
            found.contains(collection),
            "no hit from {collection}: {found:?}"
        );
    }
}

/// Typo tolerance is the reason this is not a `LIKE '%…%'` query.
#[tokio::test]
async fn a_misspelled_query_still_matches() {
    let Some(search) = connect().await else {
        return;
    };

    search
        .index(
            search::ARTISTS,
            &[serde_json::json!({
                "id": "typo-artist",
                "name": "Typotolerance Bordes of Canada",
            })],
        )
        .await
        .unwrap();

    // Two transposed characters — the kind of thing someone types into a
    // search box and a SQL `LIKE` would never match.
    let results = search.federated("Typotolerance Boards", 10).await.unwrap();

    assert!(
        results.hits.iter().any(|hit| hit["id"] == "typo-artist"),
        "a near-miss must still match: {:?}",
        results.hits
    );
}

/// A removed document stops matching, and removing it twice is not an error.
#[tokio::test]
async fn removing_a_document_is_idempotent() {
    let Some(search) = connect().await else {
        return;
    };

    let row = track("gone-1", "Gonesoon Track", "Gone Artist", "Gone Album");
    search
        .index(search::TRACKS, &[search::track_doc(&row)])
        .await
        .unwrap();

    search.remove(search::TRACKS, "gone-1").await.unwrap();

    // Again: a delete that has already happened is the desired end state, and
    // the upload delete path calls this for rows that may never have been
    // indexed.
    search
        .remove(search::TRACKS, "gone-1")
        .await
        .expect("removing an absent document must be a success");

    let results = search.federated("Gonesoon", 10).await.unwrap();
    assert!(
        !results.hits.iter().any(|hit| hit["id"] == "gone-1"),
        "the removed document still matches: {:?}",
        results.hits
    );
}

/// The library collection filters by owner. One person's uploads must never
/// appear in another's search.
#[tokio::test]
async fn library_search_is_scoped_to_one_person() {
    let Some(search) = connect().await else {
        return;
    };

    let document = |id: &str, user: &str| search::LibraryTrackDocument {
        id: id.into(),
        user_id: user.into(),
        track_id: format!("track-{id}"),
        title: "Scoped Sandcastle".into(),
        artist: "Scoped Artist".into(),
        album: "Scoped Album".into(),
        album_artist: "Scoped Artist".into(),
        genre: None,
        composer: None,
        year: Some(2001),
        duration: 120_000,
        album_art: None,
        r2_key: format!("music/{id}.flac"),
        mime_type: "audio/flac".into(),
        file_size: 4242,
        original_filename: Some(format!("{id}.flac")),
        uploaded_at: 1_700_000_000_000,
        mb_id: None,
        track_number: Some(1),
        disc_number: Some(1),
    };

    for (id, user) in [("scope-a", "user-alice"), ("scope-b", "user-bob")] {
        search
            .index(
                search::LIBRARY_TRACKS,
                &[serde_json::to_value(document(id, user)).unwrap()],
            )
            .await
            .unwrap();
    }

    let alice = search
        .library_tracks("Sandcastle", "user-alice", 50, 0)
        .await
        .unwrap();

    let ids: Vec<&str> = alice.iter().map(|doc| doc.id.as_str()).collect();
    assert!(
        ids.contains(&"scope-a"),
        "alice's own upload is missing: {ids:?}"
    );
    assert!(
        !ids.contains(&"scope-b"),
        "bob's upload leaked into alice's search: {ids:?}"
    );
}

/// An empty term lists the library newest-first rather than matching nothing —
/// a cleared search box must show the library again.
#[tokio::test]
async fn an_empty_library_query_lists_everything_newest_first() {
    let Some(search) = connect().await else {
        return;
    };

    let document = |id: &str, uploaded_at: i64| search::LibraryTrackDocument {
        id: id.into(),
        user_id: "user-order".into(),
        track_id: format!("track-{id}"),
        title: format!("Ordered {id}"),
        artist: "Ordered Artist".into(),
        album: "Ordered Album".into(),
        album_artist: "Ordered Artist".into(),
        genre: None,
        composer: None,
        year: None,
        duration: 1000,
        album_art: None,
        r2_key: format!("music/{id}.flac"),
        mime_type: "audio/flac".into(),
        file_size: 1,
        original_filename: None,
        uploaded_at,
        mb_id: None,
        track_number: None,
        disc_number: None,
    };

    for (id, at) in [
        ("order-old", 1_600_000_000_000),
        ("order-new", 1_800_000_000_000),
    ] {
        search
            .index(
                search::LIBRARY_TRACKS,
                &[serde_json::to_value(document(id, at)).unwrap()],
            )
            .await
            .unwrap();
    }

    let listed = search
        .library_tracks("", "user-order", 50, 0)
        .await
        .unwrap();
    let ids: Vec<&str> = listed.iter().map(|doc| doc.id.as_str()).collect();

    assert_eq!(
        ids,
        vec!["order-new", "order-old"],
        "an empty term must list everything, newest first"
    );
}

/// The wrong API key must be reported as the wrong API key, not as a network
/// problem — the two have completely different fixes.
#[tokio::test]
async fn a_bad_api_key_is_named_as_such() {
    let Some(url) = configured() else {
        return;
    };

    // `/health` needs no key, so connecting succeeds; the first real request
    // is where the key is checked.
    let search = Search::connect(&url, "definitely-not-the-key")
        .await
        .expect("health does not require a key");

    let error = search
        .ensure_collections()
        .await
        .expect_err("a bad key must fail");

    let message = error.to_string();
    assert!(
        message.contains("rejected the API key"),
        "the error must name the key: {message}"
    );
    assert!(message.contains("TYPESENSE_API_KEY"), "{message}");
}

/// `document_count` is what decides whether a collection needs building, so
/// it has to distinguish "missing", "empty" and "has N".
#[tokio::test]
async fn the_document_count_is_readable() {
    let Some(search) = connect().await else {
        eprintln!("skipping: ROCKSKY_TYPESENSE_URL is not set");
        return;
    };

    // A collection that was never created is `None`, not zero — the caller
    // needs to tell "nothing here yet" from "does not exist".
    assert_eq!(
        search.document_count("no_such_collection").await.unwrap(),
        None
    );

    let before = search
        .document_count("tracks")
        .await
        .unwrap()
        .expect("ensure_collections created it");

    let row = track("count-1", "Counted", "Counter", "Counting");
    search
        .index(search::TRACKS, &[search::track_doc(&row)])
        .await
        .unwrap();

    // Typesense applies writes asynchronously, so give it a moment rather
    // than asserting on a race.
    let mut after = before;
    for _ in 0..20 {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        after = search
            .document_count(search::TRACKS)
            .await
            .unwrap()
            .unwrap();
        if after > before {
            break;
        }
    }
    assert!(after > before, "{before} -> {after}");
}

/// A server that is answering is "keeping up"; the pacing in the backfill
/// depends on this being true in the normal case, or it would pause for its
/// full patience on every batch.
#[tokio::test]
async fn an_idle_server_is_keeping_up() {
    let Some(search) = connect().await else {
        eprintln!("skipping: ROCKSKY_TYPESENSE_URL is not set");
        return;
    };

    assert!(search.is_keeping_up().await);
}

/// An unreachable server is *not* keeping up. The distinction matters: the
/// backfill's response to "not keeping up" is to wait, which is the right
/// answer for a server that is down as well as one that is behind.
#[tokio::test]
async fn an_unreachable_server_is_not_keeping_up() {
    // Port 1 is never a Typesense.
    let search = Search::new("http://127.0.0.1:1", "rocksky").expect("a valid URL");
    assert!(!search.is_keeping_up().await);
}
