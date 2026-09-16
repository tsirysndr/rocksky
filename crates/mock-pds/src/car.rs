//! Writing the CAR v1 archive `com.atproto.sync.getRepo` returns.
//!
//! ```text
//! varint(len) | header   (dag-cbor: { roots: [CID], version: 1 })
//! varint(len) | CID | block bytes        -- repeated
//! ```
//!
//! The length prefix covers the CID *and* the payload, so a reader recovers
//! the payload length by subtracting however many bytes the CID took. Getting
//! that wrong is the classic CAR parsing bug, and it only surfaces against an
//! archive framed the way a real PDS frames one — which is why this writes
//! real frames instead of handing back a JSON list of records.
//!
//! One honest limitation: the commit block carries a `sig` field of the right
//! shape but not a real signature, because the mock has no repo signing key.
//! A consumer that verifies commit signatures will reject it, and should —
//! see [`crate::MockPds`] for what the mock does and does not stand in for.

use cid::Cid;
use ipld_core::ipld::Ipld;
use std::collections::BTreeMap;

/// The CID of a dag-cbor block: sha2-256 over the bytes, codec 0x71.
pub fn cid_for(bytes: &[u8]) -> Cid {
    use sha2::Digest;
    let digest = cid::multihash::Multihash::wrap(0x12, sha2::Sha256::digest(bytes).as_slice())
        .expect("a sha2-256 digest is always a valid multihash");
    Cid::new_v1(0x71, digest)
}

/// Encodes a record as dag-cbor, returning its bytes and CID.
///
/// JSON numbers arrive as either integers or floats; dag-cbor distinguishes
/// them, and a record whose `duration` came back as `151000.0` would encode as
/// a float and read back wrong. Whole floats are narrowed to integers here for
/// that reason.
pub fn encode_record(value: &serde_json::Value) -> (Cid, Vec<u8>) {
    let ipld = json_to_ipld(value);
    let bytes = serde_ipld_dagcbor::to_vec(&ipld).expect("a JSON record is always encodable");
    (cid_for(&bytes), bytes)
}

fn json_to_ipld(value: &serde_json::Value) -> Ipld {
    match value {
        serde_json::Value::Null => Ipld::Null,
        serde_json::Value::Bool(b) => Ipld::Bool(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ipld::Integer(i as i128)
            } else if let Some(f) = n.as_f64() {
                // A whole float is an integer that went through JSON.
                if f.fract() == 0.0 && f.abs() < 9e15 {
                    Ipld::Integer(f as i128)
                } else {
                    Ipld::Float(f)
                }
            } else {
                Ipld::Null
            }
        }
        serde_json::Value::String(s) => Ipld::String(s.clone()),
        serde_json::Value::Array(items) => Ipld::List(items.iter().map(json_to_ipld).collect()),
        serde_json::Value::Object(fields) => Ipld::Map(
            fields
                .iter()
                .map(|(key, value)| (key.clone(), json_to_ipld(value)))
                .collect(),
        ),
    }
}

/// A block on its way into an archive.
pub struct Block {
    pub cid: Cid,
    pub bytes: Vec<u8>,
}

/// Builds the commit block that roots a repository.
///
/// `rev` is the revision TID a real PDS would have stamped; consumers use it
/// to order commits, so it is settable rather than fabricated.
pub fn commit_block(did: &str, rev: &str, data: Cid) -> Block {
    let mut commit = BTreeMap::new();
    commit.insert("did".to_string(), Ipld::String(did.to_string()));
    commit.insert("version".to_string(), Ipld::Integer(3));
    commit.insert("data".to_string(), Ipld::Link(data));
    commit.insert("rev".to_string(), Ipld::String(rev.to_string()));
    commit.insert("prev".to_string(), Ipld::Null);
    // Shaped like a signature, but not one. See the module note.
    commit.insert("sig".to_string(), Ipld::Bytes(vec![0u8; 64]));

    let bytes = serde_ipld_dagcbor::to_vec(&Ipld::Map(commit)).expect("a commit is encodable");
    Block {
        cid: cid_for(&bytes),
        bytes,
    }
}

/// Frames a header and blocks into a CAR v1 archive.
pub fn write(root: Cid, blocks: &[Block]) -> Vec<u8> {
    let mut header = BTreeMap::new();
    header.insert("roots".to_string(), Ipld::List(vec![Ipld::Link(root)]));
    header.insert("version".to_string(), Ipld::Integer(1));
    let header = serde_ipld_dagcbor::to_vec(&Ipld::Map(header)).expect("a header is encodable");

    let mut out = Vec::new();
    push_frame(&mut out, &header);

    for block in blocks {
        // The frame holds the CID followed by the payload, under one length.
        let mut framed = block.cid.to_bytes();
        framed.extend_from_slice(&block.bytes);
        push_frame(&mut out, &framed);
    }

    out
}

fn push_frame(out: &mut Vec<u8>, payload: &[u8]) {
    let mut buffer = unsigned_varint::encode::u64_buffer();
    out.extend_from_slice(unsigned_varint::encode::u64(
        payload.len() as u64,
        &mut buffer,
    ));
    out.extend_from_slice(payload);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An independent reader, so the test is not the writer agreeing with
    /// itself. This is the parsing a consumer has to get right.
    fn read(bytes: &[u8]) -> (Vec<Cid>, Vec<(Cid, Vec<u8>)>) {
        let mut offset = 0usize;

        let read_frame = |offset: &mut usize| -> Vec<u8> {
            let (len, used) = unsigned_varint::decode::u64(&bytes[*offset..]).unwrap();
            let start = *offset + (bytes.len() - *offset - used.len());
            let payload = bytes[start..start + len as usize].to_vec();
            *offset = start + len as usize;
            payload
        };

        let header = read_frame(&mut offset);
        let Ipld::Map(header) = serde_ipld_dagcbor::from_slice::<Ipld>(&header).unwrap() else {
            panic!("the header is a map");
        };
        let Some(Ipld::List(roots)) = header.get("roots") else {
            panic!("the header declares roots");
        };
        let roots: Vec<Cid> = roots
            .iter()
            .map(|root| match root {
                Ipld::Link(cid) => *cid,
                _ => panic!("a root is a link"),
            })
            .collect();
        assert_eq!(header.get("version"), Some(&Ipld::Integer(1)));

        let mut blocks = Vec::new();
        while offset < bytes.len() {
            let framed = read_frame(&mut offset);
            // Reading the CID tells us how much of the frame it used; the rest
            // is the payload.
            let (cid, rest) = Cid::read_bytes(&framed[..])
                .map(|cid| {
                    let used = cid.encoded_len();
                    (cid, framed[used..].to_vec())
                })
                .unwrap();
            blocks.push((cid, rest));
        }

        (roots, blocks)
    }

    #[test]
    fn an_archive_round_trips_through_an_independent_reader() {
        let (cid, bytes) = encode_record(&serde_json::json!({
            "$type": "app.rocksky.song",
            "title": "Roygbiv",
        }));
        let commit = commit_block("did:plc:test", "3mvlfylougc2l", cid);
        let commit_cid = commit.cid;

        let archive = write(commit_cid, &[commit, Block { cid, bytes: bytes.clone() }]);
        let (roots, blocks) = read(&archive);

        assert_eq!(roots, vec![commit_cid]);
        assert_eq!(blocks.len(), 2);

        let record = blocks.iter().find(|(id, _)| *id == cid).expect("the record");
        assert_eq!(record.1, bytes, "the payload came back unchanged");
    }

    /// A CID is the hash of the block, so it must be reproducible — that is
    /// what lets two archives of the same records compare equal.
    #[test]
    fn a_cid_is_the_hash_of_the_block() {
        let a = encode_record(&serde_json::json!({ "title": "Roygbiv" }));
        let b = encode_record(&serde_json::json!({ "title": "Roygbiv" }));
        assert_eq!(a.0, b.0);

        let c = encode_record(&serde_json::json!({ "title": "Olson" }));
        assert_ne!(a.0, c.0);
    }

    /// dag-cbor separates integers from floats, and a JSON round trip can turn
    /// one into the other. A duration must not come back as `151000.0`.
    #[test]
    fn whole_numbers_encode_as_integers() {
        let (_, bytes) = encode_record(&serde_json::json!({ "duration": 151000.0 }));
        let Ipld::Map(decoded) = serde_ipld_dagcbor::from_slice::<Ipld>(&bytes).unwrap() else {
            panic!("a record is a map");
        };
        assert_eq!(decoded.get("duration"), Some(&Ipld::Integer(151_000)));
    }

    /// The commit is what roots the tree, so a consumer must be able to find
    /// the MST from it.
    #[test]
    fn a_commit_points_at_the_tree() {
        let data = cid_for(b"the mst root");
        let commit = commit_block("did:plc:alice", "3mvlfylougc2l", data);

        let Ipld::Map(decoded) = serde_ipld_dagcbor::from_slice::<Ipld>(&commit.bytes).unwrap()
        else {
            panic!("a commit is a map");
        };
        assert_eq!(
            decoded.get("did"),
            Some(&Ipld::String("did:plc:alice".into()))
        );
        assert_eq!(decoded.get("data"), Some(&Ipld::Link(data)));
        assert_eq!(decoded.get("version"), Some(&Ipld::Integer(3)));
    }
}
