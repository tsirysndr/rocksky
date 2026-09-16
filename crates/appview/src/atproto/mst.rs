//! Walking the Merkle Search Tree that gives repository records their keys.
//!
//! A record block in a CAR carries no key — the record's path
//! (`<collection>/<rkey>`) lives in the MST, so the URI
//! `at://<did>/<collection>/<rkey>` can only be reconstructed by walking it.
//! That matters here because `scrobbles.uri` is the sync key: ingesting
//! records without their rkeys would produce rows that cannot be updated or
//! deleted later.
//!
//! Each node is dag-cbor:
//!
//! ```text
//! { l: CID|null,                       // subtree of keys before the first entry
//!   e: [ { p: int,                     // bytes shared with the previous key
//!          k: bytes,                   // the rest of this key
//!          v: CID,                     // the record
//!          t: CID|null } ] }           // subtree of keys after this entry
//! ```
//!
//! Keys are prefix-compressed against the *previous key in the same node*, so
//! `p` is a byte count to copy from it. Reading `k` alone yields truncated
//! collection names — `.rocksky.scrobble/3abc` instead of
//! `app.rocksky.scrobble/3abc`.

use super::car::Car;
use cid::Cid;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Node {
    /// Left subtree. Absent or null at the leftmost edge.
    #[serde(default)]
    l: Option<Cid>,
    #[serde(default)]
    e: Vec<Entry>,
}

#[derive(Debug, Deserialize)]
struct Entry {
    /// Bytes to take from the previous key in this node.
    p: usize,
    /// The remaining key bytes.
    #[serde(with = "serde_bytes_compat")]
    k: Vec<u8>,
    /// The record this key points at.
    v: Cid,
    /// Subtree of keys sorted after this one.
    #[serde(default)]
    t: Option<Cid>,
}

/// `k` is a dag-cbor byte string. serde would otherwise try a sequence.
mod serde_bytes_compat {
    use serde::{Deserialize, Deserializer};

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<u8>, D::Error> {
        // ByteBuf handles both the byte-string and sequence encodings, so a
        // node written by either implementation still reads.
        let bytes = serde_bytes::ByteBuf::deserialize(deserializer)?;
        Ok(bytes.into_vec())
    }
}

/// One record's location in the repository.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordRef {
    /// e.g. `app.rocksky.scrobble`
    pub collection: String,
    /// e.g. `3mvlfylougc2l`
    pub rkey: String,
    pub cid: Cid,
}

impl RecordRef {
    /// The record's AT-URI for `did`.
    pub fn uri(&self, did: &str) -> String {
        format!("at://{}/{}/{}", did, self.collection, self.rkey)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum MstError {
    #[error("MST node {0} is missing from the archive")]
    MissingNode(Cid),
    #[error("malformed MST node {cid}: {source}")]
    Decode {
        cid: Cid,
        #[source]
        source: serde_ipld_dagcbor::DecodeError<std::convert::Infallible>,
    },
    #[error("MST key is not valid UTF-8")]
    Key,
    #[error("MST entry has a prefix length of {p} but the previous key is only {len} bytes")]
    Prefix { p: usize, len: usize },
    #[error("MST is deeper than {0} levels; refusing to keep walking")]
    TooDeep(usize),
}

/// A malformed or hostile archive must not be able to recurse without bound.
const MAX_DEPTH: usize = 64;

/// Collects every record in the tree rooted at `root`.
pub fn walk(car: &Car, root: &Cid) -> Result<Vec<RecordRef>, MstError> {
    let mut out = Vec::new();
    walk_node(car, root, &mut out, 0)?;
    Ok(out)
}

fn walk_node(car: &Car, cid: &Cid, out: &mut Vec<RecordRef>, depth: usize) -> Result<(), MstError> {
    if depth > MAX_DEPTH {
        return Err(MstError::TooDeep(MAX_DEPTH));
    }

    let bytes = car.block(cid).ok_or(MstError::MissingNode(*cid))?;
    let node: Node = serde_ipld_dagcbor::from_slice(bytes)
        .map_err(|source| MstError::Decode { cid: *cid, source })?;

    // Keys sort before the first entry.
    if let Some(left) = &node.l {
        walk_node(car, left, out, depth + 1)?;
    }

    let mut previous: Vec<u8> = Vec::new();
    for entry in &node.e {
        if entry.p > previous.len() {
            return Err(MstError::Prefix {
                p: entry.p,
                len: previous.len(),
            });
        }

        // Reconstruct the key from the shared prefix plus this entry's suffix.
        let mut key = previous[..entry.p].to_vec();
        key.extend_from_slice(&entry.k);
        previous = key.clone();

        let key = String::from_utf8(key).map_err(|_| MstError::Key)?;
        if let Some((collection, rkey)) = key.split_once('/') {
            out.push(RecordRef {
                collection: collection.to_string(),
                rkey: rkey.to_string(),
                cid: entry.v,
            });
        }

        // Then the subtree of keys after this entry.
        if let Some(right) = &entry.t {
            walk_node(car, right, out, depth + 1)?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ipld_core::ipld::Ipld;
    use std::collections::{BTreeMap, HashMap};

    fn cid_for(bytes: &[u8]) -> Cid {
        let digest = cid::multihash::Multihash::wrap(
            0x12,
            <sha2::Sha256 as sha2::Digest>::digest(bytes).as_slice(),
        )
        .unwrap();
        Cid::new_v1(0x71, digest)
    }

    fn entry(p: i128, k: &str, v: Cid, t: Option<Cid>) -> Ipld {
        let mut map = BTreeMap::new();
        map.insert("p".to_string(), Ipld::Integer(p));
        map.insert("k".to_string(), Ipld::Bytes(k.as_bytes().to_vec()));
        map.insert("v".to_string(), Ipld::Link(v));
        map.insert("t".to_string(), t.map(Ipld::Link).unwrap_or(Ipld::Null));
        Ipld::Map(map)
    }

    fn node(l: Option<Cid>, entries: Vec<Ipld>) -> Vec<u8> {
        let mut map = BTreeMap::new();
        map.insert("l".to_string(), l.map(Ipld::Link).unwrap_or(Ipld::Null));
        map.insert("e".to_string(), Ipld::List(entries));
        serde_ipld_dagcbor::to_vec(&Ipld::Map(map)).unwrap()
    }

    /// Wraps hand-built blocks in a `Car` so the walk can be driven directly.
    fn car(blocks: Vec<(Cid, Vec<u8>)>, root: Cid) -> Car {
        Car {
            roots: vec![root],
            blocks: blocks.into_iter().collect::<HashMap<_, _>>(),
        }
    }

    #[test]
    fn reads_keys_from_a_single_node() {
        let record = cid_for(b"record-1");
        let bytes = node(
            None,
            vec![entry(0, "app.rocksky.scrobble/3aaa", record, None)],
        );
        let root = cid_for(&bytes);

        let refs = walk(&car(vec![(root, bytes)], root), &root).unwrap();
        assert_eq!(
            refs,
            vec![RecordRef {
                collection: "app.rocksky.scrobble".into(),
                rkey: "3aaa".into(),
                cid: record,
            }]
        );
    }

    /// The prefix compression is the part that silently corrupts collection
    /// names if `p` is ignored.
    #[test]
    fn prefix_compression_is_expanded_against_the_previous_key() {
        let first = cid_for(b"r1");
        let second = cid_for(b"r2");
        let bytes = node(
            None,
            vec![
                entry(0, "app.rocksky.scrobble/3aaa", first, None),
                // Shares the first 21 bytes ("app.rocksky.scrobble/") and
                // supplies only the differing rkey.
                entry(21, "3bbb", second, None),
            ],
        );
        let root = cid_for(&bytes);

        let refs = walk(&car(vec![(root, bytes)], root), &root).unwrap();
        assert_eq!(refs.len(), 2);
        assert_eq!(refs[1].collection, "app.rocksky.scrobble");
        assert_eq!(refs[1].rkey, "3bbb");
        assert_eq!(refs[1].cid, second);
    }

    #[test]
    fn subtrees_are_walked_in_key_order() {
        let left_record = cid_for(b"left");
        let mid_record = cid_for(b"mid");
        let right_record = cid_for(b"right");

        let left_bytes = node(
            None,
            vec![entry(0, "app.rocksky.album/1", left_record, None)],
        );
        let left = cid_for(&left_bytes);

        let right_bytes = node(
            None,
            vec![entry(0, "app.rocksky.song/9", right_record, None)],
        );
        let right = cid_for(&right_bytes);

        let root_bytes = node(
            Some(left),
            vec![entry(0, "app.rocksky.scrobble/5", mid_record, Some(right))],
        );
        let root = cid_for(&root_bytes);

        let refs = walk(
            &car(
                vec![(left, left_bytes), (right, right_bytes), (root, root_bytes)],
                root,
            ),
            &root,
        )
        .unwrap();

        let keys: Vec<String> = refs
            .iter()
            .map(|r| format!("{}/{}", r.collection, r.rkey))
            .collect();
        assert_eq!(
            keys,
            vec![
                "app.rocksky.album/1",
                "app.rocksky.scrobble/5",
                "app.rocksky.song/9"
            ],
            "left subtree, then the entry, then its right subtree"
        );
    }

    #[test]
    fn a_missing_node_is_reported_rather_than_silently_truncating() {
        let record = cid_for(b"r");
        let missing = cid_for(b"missing-node");
        let bytes = node(Some(missing), vec![entry(0, "a/1", record, None)]);
        let root = cid_for(&bytes);

        let err = walk(&car(vec![(root, bytes)], root), &root).expect_err("node is absent");
        assert!(matches!(err, MstError::MissingNode(_)), "{err:?}");
    }

    #[test]
    fn an_impossible_prefix_length_is_rejected() {
        let record = cid_for(b"r");
        // p = 10 with no previous key cannot be satisfied.
        let bytes = node(None, vec![entry(10, "x", record, None)]);
        let root = cid_for(&bytes);

        let err = walk(&car(vec![(root, bytes)], root), &root).expect_err("bad prefix");
        assert!(matches!(err, MstError::Prefix { .. }), "{err:?}");
    }

    #[test]
    fn a_self_referencing_node_hits_the_depth_limit_instead_of_recursing_forever() {
        // A cycle cannot occur in a well-formed content-addressed tree, but a
        // hostile archive can contain one and must not blow the stack.
        let record = cid_for(b"r");
        let placeholder = cid_for(b"placeholder");
        let bytes = node(Some(placeholder), vec![entry(0, "a/1", record, None)]);
        let root = cid_for(&bytes);
        // Map the placeholder to the same bytes, so it points back at itself.
        let refs = walk(
            &car(vec![(root, bytes.clone()), (placeholder, bytes)], root),
            &root,
        );
        assert!(matches!(refs, Err(MstError::TooDeep(_))), "{refs:?}");
    }

    #[test]
    fn keys_without_a_collection_separator_are_skipped() {
        let record = cid_for(b"r");
        let bytes = node(None, vec![entry(0, "no-separator", record, None)]);
        let root = cid_for(&bytes);

        let refs = walk(&car(vec![(root, bytes)], root), &root).unwrap();
        assert!(refs.is_empty(), "an unparseable key is not a record");
    }

    #[test]
    fn uris_are_built_from_the_did_and_key() {
        let reference = RecordRef {
            collection: "app.rocksky.scrobble".into(),
            rkey: "3mvlfylougc2l".into(),
            cid: cid_for(b"r"),
        };
        assert_eq!(
            reference.uri("did:plc:abc"),
            "at://did:plc:abc/app.rocksky.scrobble/3mvlfylougc2l"
        );
    }
}
