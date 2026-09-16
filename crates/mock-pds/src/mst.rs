//! Building the Merkle Search Tree that gives repository records their keys.
//!
//! A repository CAR carries records as bare dag-cbor blocks with no key
//! attached: the path `<collection>/<rkey>` lives in the MST, and a consumer
//! can only recover the AT-URI by walking it. A mock that skipped the tree —
//! handing back a flat list of records — would let a broken MST walker pass,
//! which is the one thing worth testing about repo sync. So the tree is built
//! properly.
//!
//! Two rules decide the shape.
//!
//! **Layers.** A key's layer is the number of leading zero *pairs* of bits in
//! `sha256(key)`: two leading zero bits is layer 1, four is layer 2, and so
//! on. Since a hash is effectively random, about 1 key in 4 sits above layer
//! 0, 1 in 16 above layer 1, and the tree comes out roughly balanced without
//! anyone balancing it. The same keys always produce the same tree, whatever
//! order they were inserted in — that is what makes two repos comparable by
//! their root hash alone.
//!
//! **Prefix compression.** Within a node, each key stores only what it does
//! not share with the key before it:
//!
//! ```text
//! { l: CID|null,                       // keys sorting before the first entry
//!   e: [ { p: int,                     // bytes shared with the previous key
//!          k: bytes,                   // the rest of this key
//!          v: CID,                     // the record
//!          t: CID|null } ] }           // keys sorting after this entry
//! ```
//!
//! So a node holding `app.rocksky.song/3abc` then `app.rocksky.song/3abd`
//! stores the second as `p: 22, k: "d"`. A reader that ignores `p` recovers
//! truncated collection names, which is a real bug worth catching — and it
//! only shows up if the mock compresses, so it does.

use cid::Cid;
use ipld_core::ipld::Ipld;
use std::collections::BTreeMap;

/// A record's key and the block it points at.
#[derive(Debug, Clone)]
pub struct Leaf {
    /// `<collection>/<rkey>`
    pub key: String,
    pub cid: Cid,
}

/// A node of the built tree, ready to be written as a block.
pub struct BuiltNode {
    pub cid: Cid,
    pub bytes: Vec<u8>,
}

/// The layer a key belongs on: leading zero bit-pairs of its sha256.
///
/// Counting *pairs* rather than single bits is what gives the tree a fanout of
/// 4 instead of 2.
pub fn layer_for(key: &str) -> usize {
    use sha2::Digest;
    let digest = sha2::Sha256::digest(key.as_bytes());

    let mut zeros = 0usize;
    for byte in digest.iter() {
        if *byte == 0 {
            zeros += 8;
            continue;
        }
        zeros += byte.leading_zeros() as usize;
        break;
    }
    zeros / 2
}

/// Bytes two keys share at the front.
fn common_prefix(a: &str, b: &str) -> usize {
    a.bytes().zip(b.bytes()).take_while(|(x, y)| x == y).count()
}

/// Builds the tree over `leaves` and returns its root plus every node.
///
/// `leaves` need not be sorted; they are sorted here, because the tree is
/// defined by the keys and not by insertion order.
pub fn build(mut leaves: Vec<Leaf>) -> (Cid, Vec<BuiltNode>) {
    leaves.sort_by(|a, b| a.key.cmp(&b.key));

    let mut nodes = Vec::new();
    // An empty repo still has a root: one node with no entries.
    let root = build_subtree(&leaves, &mut nodes);
    (root, nodes)
}

/// Builds the node covering `leaves`, recursing into the gaps between its
/// entries.
///
/// The node sits at the highest layer present in `leaves`; everything lower
/// hangs off it. Taking the highest layer *present* rather than counting down
/// from some fixed height is what keeps empty intermediate nodes out of the
/// tree — a layer-3 key next to a layer-0 key points straight at it.
fn build_subtree(leaves: &[Leaf], nodes: &mut Vec<BuiltNode>) -> Cid {
    let layer = leaves
        .iter()
        .map(|leaf| layer_for(&leaf.key))
        .max()
        .unwrap_or(0);

    // Indices of the leaves that belong on this node.
    let here: Vec<usize> = (0..leaves.len())
        .filter(|i| layer_for(&leaves[*i].key) == layer)
        .collect();

    // Everything before the first entry becomes the left subtree.
    let left = match here.first() {
        Some(&first) if first > 0 => Some(build_subtree(&leaves[..first], nodes)),
        _ => None,
    };

    let mut entries = Vec::with_capacity(here.len());
    let mut previous = String::new();

    for (position, &index) in here.iter().enumerate() {
        let leaf = &leaves[index];

        // Leaves between this entry and the next one — or after the last —
        // hang off this entry.
        let gap_end = here.get(position + 1).copied().unwrap_or(leaves.len());
        let gap = &leaves[index + 1..gap_end];
        let subtree = (!gap.is_empty()).then(|| build_subtree(gap, nodes));

        let shared = common_prefix(&previous, &leaf.key);
        let mut entry = BTreeMap::new();
        entry.insert("p".to_string(), Ipld::Integer(shared as i128));
        entry.insert(
            "k".to_string(),
            Ipld::Bytes(leaf.key.as_bytes()[shared..].to_vec()),
        );
        entry.insert("v".to_string(), Ipld::Link(leaf.cid));
        entry.insert(
            "t".to_string(),
            subtree.map(Ipld::Link).unwrap_or(Ipld::Null),
        );

        entries.push(Ipld::Map(entry));
        previous = leaf.key.clone();
    }

    let mut node = BTreeMap::new();
    node.insert("e".to_string(), Ipld::List(entries));
    node.insert("l".to_string(), left.map(Ipld::Link).unwrap_or(Ipld::Null));

    let bytes =
        serde_ipld_dagcbor::to_vec(&Ipld::Map(node)).expect("an MST node is always encodable");
    let cid = crate::car::cid_for(&bytes);
    nodes.push(BuiltNode { cid, bytes });
    cid
}

#[cfg(test)]
mod tests {
    use super::*;

    fn leaf(key: &str) -> Leaf {
        Leaf {
            key: key.to_string(),
            cid: crate::car::cid_for(key.as_bytes()),
        }
    }

    /// The layer is leading zero bit-*pairs* of the key's sha256, so each case
    /// is checkable against the digest it comes from rather than against a
    /// remembered fixture. The first digest byte is given in binary alongside.
    #[test]
    fn layers_come_from_the_key_hash() {
        // | key                                  | sha256[0] | zero bits | layer |
        // |--------------------------------------|-----------|-----------|-------|
        // | com.example.record/3jqfcqzm3fo2j     | 0100_0111 |         1 |     0 |
        // | com.example.record/3jqfcqzm3fs2j     | 0001_1001 |         3 |     1 |
        // | app.rocksky.scrobble/3mu000012       | 0000_1010 |         4 |     2 |
        // | app.rocksky.scrobble/3mu000021       | 0000_0001 |         7 |     3 |
        // | app.rocksky.scrobble/3mu000220       | 0000_0000 |         9 |     4 |
        for (key, expected) in [
            ("com.example.record/3jqfcqzm3fo2j", 0),
            ("com.example.record/3jqfcqzm3fs2j", 1),
            ("app.rocksky.scrobble/3mu000012", 2),
            ("app.rocksky.scrobble/3mu000021", 3),
            ("app.rocksky.scrobble/3mu000220", 4),
        ] {
            assert_eq!(layer_for(key), expected, "{key}");
        }
    }

    /// And the rule itself, checked against the digest rather than a table: an
    /// odd number of leading zero bits rounds down, because layers count
    /// pairs.
    #[test]
    fn an_odd_leading_zero_bit_does_not_raise_the_layer() {
        use sha2::Digest;
        for i in 0..200 {
            let key = format!("app.rocksky.scrobble/3mu{i:06}");
            let digest = sha2::Sha256::digest(key.as_bytes());

            let bits: usize = digest
                .iter()
                .scan(false, |stop, byte| {
                    if *stop {
                        return None;
                    }
                    if *byte == 0 {
                        Some(8)
                    } else {
                        *stop = true;
                        Some(byte.leading_zeros() as usize)
                    }
                })
                .sum();

            assert_eq!(layer_for(&key), bits / 2, "{key} has {bits} leading zeros");
        }
    }

    /// The same keys must always give the same root, whatever order they
    /// arrive in — otherwise two repos holding the same records would not
    /// compare equal.
    #[test]
    fn the_root_does_not_depend_on_insertion_order() {
        let keys = [
            "app.rocksky.song/3aaa",
            "app.rocksky.song/3bbb",
            "app.rocksky.scrobble/3ccc",
            "app.rocksky.album/3ddd",
        ];

        let forward: Vec<Leaf> = keys.iter().map(|k| leaf(k)).collect();
        let backward: Vec<Leaf> = keys.iter().rev().map(|k| leaf(k)).collect();

        let (a, _) = build(forward);
        let (b, _) = build(backward);
        assert_eq!(a, b);
    }

    /// An empty repo is still a tree with a root, not an absent one.
    #[test]
    fn an_empty_repo_has_a_root_node() {
        let (root, nodes) = build(Vec::new());
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].cid, root);
    }

    /// Keys sharing a collection name must actually be compressed, or the
    /// mock would never exercise a reader's prefix handling.
    ///
    /// Enough keys that adjacent same-layer ones are certain to share a node:
    /// with three keys they can each land on a different layer and nothing is
    /// ever compressed.
    #[test]
    fn keys_in_one_node_are_prefix_compressed() {
        let leaves: Vec<Leaf> = (0..64)
            .map(|i| leaf(&format!("app.rocksky.scrobble/3mu{i:06}")))
            .collect();

        let (_, nodes) = build(leaves);

        let compressed = nodes.iter().any(|node| {
            let decoded: Ipld = serde_ipld_dagcbor::from_slice(&node.bytes).unwrap();
            let Ipld::Map(map) = decoded else {
                return false;
            };
            let Some(Ipld::List(entries)) = map.get("e") else {
                return false;
            };
            entries.iter().any(|entry| {
                let Ipld::Map(entry) = entry else {
                    return false;
                };
                matches!(entry.get("p"), Some(Ipld::Integer(p)) if *p > 0)
            })
        });

        assert!(
            compressed,
            "no entry reused a prefix from the one before it"
        );
    }

    /// Every leaf handed in must be reachable, and exactly once.
    #[test]
    fn every_leaf_ends_up_in_the_tree() {
        let keys: Vec<String> = (0..64)
            .map(|i| format!("app.rocksky.scrobble/3mu{i:04}"))
            .collect();
        let leaves: Vec<Leaf> = keys.iter().map(|k| leaf(k)).collect();

        let (root, nodes) = build(leaves);
        let found = walk(&nodes, &root);

        assert_eq!(found.len(), keys.len());
        let mut sorted = keys.clone();
        sorted.sort();
        assert_eq!(found, sorted, "keys come back in sorted order");
    }

    /// With this many keys the tree is more than one node deep, which is the
    /// case a flat mock would never produce.
    #[test]
    fn a_large_repo_builds_a_tree_deeper_than_one_node() {
        let leaves: Vec<Leaf> = (0..256)
            .map(|i| leaf(&format!("app.rocksky.scrobble/3mu{i:04}")))
            .collect();
        let (_, nodes) = build(leaves);
        assert!(nodes.len() > 1, "only {} node(s) built", nodes.len());
    }

    /// An independent walk, so the test is not just the builder agreeing with
    /// itself. Mirrors what a consumer has to do: expand `p` against the
    /// previous key in the same node.
    fn walk(nodes: &[super::BuiltNode], root: &Cid) -> Vec<String> {
        let mut out = Vec::new();
        walk_node(nodes, root, &mut out);
        out
    }

    fn walk_node(nodes: &[super::BuiltNode], cid: &Cid, out: &mut Vec<String>) {
        let bytes = &nodes
            .iter()
            .find(|node| node.cid == *cid)
            .expect("the tree references a node it did not emit")
            .bytes;

        let Ipld::Map(map) = serde_ipld_dagcbor::from_slice::<Ipld>(bytes).unwrap() else {
            panic!("an MST node is a map");
        };

        if let Some(Ipld::Link(left)) = map.get("l") {
            walk_node(nodes, left, out);
        }

        let Some(Ipld::List(entries)) = map.get("e") else {
            return;
        };

        let mut previous = String::new();
        for entry in entries {
            let Ipld::Map(entry) = entry else { continue };
            let Some(Ipld::Integer(p)) = entry.get("p") else {
                continue;
            };
            let Some(Ipld::Bytes(k)) = entry.get("k") else {
                continue;
            };

            let key = format!(
                "{}{}",
                &previous[..*p as usize],
                std::str::from_utf8(k).unwrap()
            );
            out.push(key.clone());
            previous = key;

            if let Some(Ipld::Link(subtree)) = entry.get("t") {
                walk_node(nodes, subtree, out);
            }
        }
    }
}
