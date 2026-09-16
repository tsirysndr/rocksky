//! `getRepo` checked by parsing what it returns.
//!
//! The archive is decoded here from its bytes — frames, commit, MST walk —
//! rather than trusted. If the mock's writer and this reader ever disagree,
//! one of them is wrong and it shows up here instead of as a mystifying
//! failure in whatever crate consumes the mock.
//!
//! The fixture is a real repository, which is the point: 54 records captured
//! from `oops.wtf`, carrying the things invented records never do — nulls,
//! unicode titles, `artists` sub-arrays, ISRCs, and album names with
//! punctuation that breaks naive key handling.

use cid::Cid;
use ipld_core::ipld::Ipld;
use rocksky_mock_pds::MockPds;
use std::collections::HashMap;

/// A parsed archive: the roots plus every block by CID.
struct Archive {
    roots: Vec<Cid>,
    blocks: HashMap<Cid, Vec<u8>>,
}

/// Parses CAR v1 frames. The length prefix covers the CID *and* the payload,
/// so the payload length is whatever is left after the CID is read.
fn parse(bytes: &[u8]) -> Archive {
    let mut offset = 0usize;

    let mut next = |offset: &mut usize| -> Vec<u8> {
        let (len, rest) = unsigned_varint::decode::u64(&bytes[*offset..]).expect("a varint");
        let start = bytes.len() - rest.len();
        let end = start + len as usize;
        *offset = end;
        bytes[start..end].to_vec()
    };

    let header = next(&mut offset);
    let Ipld::Map(header) = serde_ipld_dagcbor::from_slice::<Ipld>(&header).expect("the header")
    else {
        panic!("the header is a map");
    };
    assert_eq!(
        header.get("version"),
        Some(&Ipld::Integer(1)),
        "CAR v1 is what getRepo returns"
    );
    let Some(Ipld::List(roots)) = header.get("roots") else {
        panic!("the header declares roots");
    };
    let roots = roots
        .iter()
        .map(|root| match root {
            Ipld::Link(cid) => *cid,
            other => panic!("a root must be a link, got {other:?}"),
        })
        .collect();

    let mut blocks = HashMap::new();
    while offset < bytes.len() {
        let framed = next(&mut offset);
        let cid = Cid::read_bytes(&framed[..]).expect("a CID");
        blocks.insert(cid, framed[cid.encoded_len()..].to_vec());
    }

    Archive { roots, blocks }
}

/// Walks the MST, expanding each key's prefix against the previous key in the
/// same node. A reader that skipped that would recover truncated collection
/// names.
fn walk(archive: &Archive, root: &Cid) -> Vec<(String, Cid)> {
    let mut out = Vec::new();
    walk_node(archive, root, &mut out);
    out
}

fn walk_node(archive: &Archive, cid: &Cid, out: &mut Vec<(String, Cid)>) {
    let bytes = archive
        .blocks
        .get(cid)
        .unwrap_or_else(|| panic!("the tree references {cid}, which is not in the archive"));

    let Ipld::Map(node) = serde_ipld_dagcbor::from_slice::<Ipld>(bytes).expect("an MST node")
    else {
        panic!("an MST node is a map");
    };

    if let Some(Ipld::Link(left)) = node.get("l") {
        walk_node(archive, left, out);
    }

    let Some(Ipld::List(entries)) = node.get("e") else {
        return;
    };

    let mut previous = String::new();
    for entry in entries {
        let Ipld::Map(entry) = entry else {
            panic!("an entry is a map");
        };
        let Some(Ipld::Integer(shared)) = entry.get("p") else {
            panic!("an entry has a prefix length");
        };
        let Some(Ipld::Bytes(suffix)) = entry.get("k") else {
            panic!("an entry has key bytes");
        };
        let Some(Ipld::Link(value)) = entry.get("v") else {
            panic!("an entry points at a record");
        };

        let key = format!(
            "{}{}",
            &previous[..*shared as usize],
            std::str::from_utf8(suffix).expect("a key is UTF-8")
        );
        out.push((key.clone(), *value));
        previous = key;

        if let Some(Ipld::Link(subtree)) = entry.get("t") {
            walk_node(archive, subtree, out);
        }
    }
}

async fn fetch(pds: &MockPds) -> Archive {
    let bytes = reqwest::get(format!(
        "{}/xrpc/com.atproto.sync.getRepo?did={}",
        pds.url(),
        pds.did()
    ))
    .await
    .expect("request")
    .bytes()
    .await
    .expect("body");
    parse(&bytes)
}

/// Reads the commit and returns the MST root it points at.
fn mst_root(archive: &Archive, did: &str) -> Cid {
    let root = archive.roots.first().expect("a root");
    let bytes = archive.blocks.get(root).expect("the commit block");

    let Ipld::Map(commit) = serde_ipld_dagcbor::from_slice::<Ipld>(bytes).expect("the commit")
    else {
        panic!("a commit is a map");
    };

    assert_eq!(commit.get("did"), Some(&Ipld::String(did.to_string())));
    assert_eq!(commit.get("version"), Some(&Ipld::Integer(3)));
    assert!(
        matches!(commit.get("rev"), Some(Ipld::String(rev)) if rev.len() == 13),
        "the commit carries a TID-shaped rev"
    );

    let Some(Ipld::Link(data)) = commit.get("data") else {
        panic!("a commit points at the MST root");
    };
    *data
}

#[tokio::test]
async fn an_empty_repo_still_returns_a_valid_archive() {
    let pds = MockPds::start().await;
    let archive = fetch(&pds).await;

    let root = mst_root(&archive, &pds.did());
    assert!(
        archive.blocks.contains_key(&root),
        "the root node is in the archive even with no records"
    );
    assert!(walk(&archive, &root).is_empty());
}

#[tokio::test]
async fn every_record_written_comes_back_with_its_key() {
    let pds = MockPds::start().await;

    let written = [
        ("app.rocksky.song", "3aaa"),
        ("app.rocksky.song", "3bbb"),
        ("app.rocksky.album", "3ccc"),
        ("app.rocksky.artist", "3ddd"),
        ("app.rocksky.scrobble", "3eee"),
    ];
    for (collection, rkey) in written {
        pds.put_record(
            collection,
            rkey,
            serde_json::json!({ "$type": collection, "rkey": rkey }),
        );
    }

    let archive = fetch(&pds).await;
    let found = walk(&archive, &mst_root(&archive, &pds.did()));

    let mut keys: Vec<String> = found.iter().map(|(key, _)| key.clone()).collect();
    keys.sort();
    let mut expected: Vec<String> = written
        .iter()
        .map(|(collection, rkey)| format!("{collection}/{rkey}"))
        .collect();
    expected.sort();

    assert_eq!(keys, expected, "keys must survive prefix compression intact");
}

/// The keys the tree yields must point at records that are actually present,
/// and decode to what was stored.
#[tokio::test]
async fn a_key_leads_to_its_record() {
    let pds = MockPds::start().await;
    pds.put_record(
        "app.rocksky.song",
        "3aaa",
        serde_json::json!({
            "$type": "app.rocksky.song",
            "title": "Roygbiv",
            "duration": 151000,
        }),
    );

    let archive = fetch(&pds).await;
    let found = walk(&archive, &mst_root(&archive, &pds.did()));

    let (key, cid) = found.first().expect("one record");
    assert_eq!(key, "app.rocksky.song/3aaa");

    let bytes = archive.blocks.get(cid).expect("the record block");
    let Ipld::Map(record) = serde_ipld_dagcbor::from_slice::<Ipld>(bytes).expect("the record")
    else {
        panic!("a record is a map");
    };

    assert_eq!(record.get("title"), Some(&Ipld::String("Roygbiv".into())));
    assert_eq!(
        record.get("duration"),
        Some(&Ipld::Integer(151_000)),
        "a duration must stay an integer through dag-cbor"
    );
}

/// The whole point: a real repository, round-tripped.
#[tokio::test]
async fn the_production_repo_round_trips_through_a_real_car() {
    let pds = MockPds::with_production_data().await;

    let stored = pds.records(None);
    assert!(
        stored.len() >= 50,
        "the fixture should be a substantial repo, got {}",
        stored.len()
    );

    let archive = fetch(&pds).await;
    let found = walk(&archive, &mst_root(&archive, &pds.did()));

    assert_eq!(
        found.len(),
        stored.len(),
        "every record in the repo is reachable through the tree"
    );

    // Keys come out sorted, which is what makes an MST comparable.
    let keys: Vec<String> = found.iter().map(|(key, _)| key.clone()).collect();
    let mut sorted = keys.clone();
    sorted.sort();
    assert_eq!(keys, sorted, "an MST walk yields keys in order");

    // And each one names a collection the fixture actually has, with a
    // non-empty rkey — the failure mode of a broken prefix expansion is a
    // truncated collection name like `.rocksky.song`.
    for (key, cid) in &found {
        let (collection, rkey) = key.split_once('/').expect("a key is collection/rkey");
        assert!(
            collection.starts_with("app.rocksky."),
            "truncated collection name: {collection:?}"
        );
        assert!(!rkey.is_empty(), "empty rkey in {key}");
        assert!(
            archive.blocks.contains_key(cid),
            "{key} points at a missing block"
        );
    }
}

/// Records from a real repo must decode to the same values that went in —
/// including the awkward ones.
#[tokio::test]
async fn production_records_survive_the_encoding_unchanged() {
    let pds = MockPds::with_production_data().await;
    let archive = fetch(&pds).await;
    let found: HashMap<String, Cid> = walk(&archive, &mst_root(&archive, &pds.did()))
        .into_iter()
        .collect();

    for stored in pds.records(None) {
        let key = format!("{}/{}", stored.collection, stored.rkey);
        let cid = found.get(&key).unwrap_or_else(|| panic!("{key} is missing"));
        let bytes = archive.blocks.get(cid).expect("the block");

        let decoded: Ipld = serde_ipld_dagcbor::from_slice(bytes).expect("the record decodes");
        let Ipld::Map(decoded) = decoded else {
            panic!("{key} is not a map");
        };

        // `$type` is what a consumer dispatches on, so it has to survive.
        assert_eq!(
            decoded.get("$type"),
            Some(&Ipld::String(stored.collection.clone())),
            "{key} lost its $type"
        );

        // Every field the record had is still there.
        for field in stored.value.as_object().expect("a record is an object").keys() {
            assert!(
                decoded.contains_key(field),
                "{key} lost the field {field:?}"
            );
        }
    }
}

/// A repo big enough to need more than one MST node — the case a flat mock
/// would never produce, and where a walker's recursion is actually tested.
#[tokio::test]
async fn a_large_repo_builds_a_tree_with_subtrees() {
    let pds = MockPds::start().await;
    for i in 0..300 {
        pds.put_record(
            "app.rocksky.scrobble",
            &format!("3mu{i:05}"),
            serde_json::json!({ "$type": "app.rocksky.scrobble", "n": i }),
        );
    }

    let archive = fetch(&pds).await;
    let root = mst_root(&archive, &pds.did());
    let found = walk(&archive, &root);

    assert_eq!(found.len(), 300);

    // More blocks than records plus a commit plus one node means the tree
    // genuinely branched.
    let nodes = archive.blocks.len() - 300 - 1;
    assert!(nodes > 1, "the tree is a single node; only {nodes} built");
}

/// Writing changes the commit, so a consumer can tell a repo moved.
#[tokio::test]
async fn a_write_changes_the_commit() {
    let pds = MockPds::start().await;

    let before = fetch(&pds).await;
    let before_root = *before.roots.first().unwrap();

    pds.put_record("app.rocksky.song", "3aaa", serde_json::json!({ "$type": "app.rocksky.song" }));

    let after = fetch(&pds).await;
    assert_ne!(
        before_root,
        *after.roots.first().unwrap(),
        "the commit CID must move when the repo does"
    );
}

/// `getLatestCommit` must agree with what `getRepo` would return, or a
/// consumer polling for changes would see phantom ones.
#[tokio::test]
async fn the_latest_commit_matches_the_archive() {
    let pds = MockPds::with_production_data().await;

    let latest: serde_json::Value = reqwest::get(format!(
        "{}/xrpc/com.atproto.sync.getLatestCommit?did={}",
        pds.url(),
        pds.did()
    ))
    .await
    .expect("request")
    .json()
    .await
    .expect("body");

    let archive = fetch(&pds).await;
    assert_eq!(
        latest["cid"].as_str().unwrap(),
        archive.roots.first().unwrap().to_string()
    );
}

#[tokio::test]
async fn syncing_an_unknown_repo_is_an_error_not_an_empty_archive() {
    let pds = MockPds::start().await;

    let response = reqwest::get(format!(
        "{}/xrpc/com.atproto.sync.getRepo?did=did:plc:nobodyhere",
        pds.url()
    ))
    .await
    .expect("request");

    assert_eq!(response.status(), 400);
    let body: serde_json::Value = response.json().await.unwrap();
    assert_eq!(body["error"], "RepoNotFound");
}

/// The content type has to be right, or a client that checks it will refuse
/// the body before parsing it.
#[tokio::test]
async fn an_archive_is_served_as_a_car() {
    let pds = MockPds::start().await;

    let response = reqwest::get(format!(
        "{}/xrpc/com.atproto.sync.getRepo?did={}",
        pds.url(),
        pds.did()
    ))
    .await
    .expect("request");

    assert_eq!(
        response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok()),
        Some("application/vnd.ipld.car")
    );
}
