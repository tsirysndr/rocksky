//! A reader for CAR v1 archives, which is the format
//! `com.atproto.sync.getRepo` returns.
//!
//! The layout is a header followed by blocks, each length-prefixed with an
//! unsigned varint:
//!
//! ```text
//! varint(len) | header   (dag-cbor: { roots: [CID], version: 1 })
//! varint(len) | CID | block bytes        -- repeated
//! ```
//!
//! The block length covers the CID *and* the bytes, so the payload length is
//! whatever is left after the CID has been read.
//!
//! A repository CAR holds two kinds of block mixed together: the commit and
//! MST nodes that give records their keys, and the records themselves. This
//! module only indexes them by CID; [`super::mst`] walks the tree.

use cid::Cid;
use std::collections::HashMap;

#[derive(Debug, thiserror::Error)]
pub enum CarError {
    #[error("truncated CAR: expected {expected} more bytes at offset {offset}")]
    Truncated { offset: usize, expected: usize },
    #[error("malformed varint at offset {0}")]
    Varint(usize),
    #[error("malformed CID at offset {offset}: {source}")]
    Cid {
        offset: usize,
        #[source]
        source: cid::Error,
    },
    #[error("malformed CAR header: {0}")]
    Header(#[source] serde_ipld_dagcbor::DecodeError<std::convert::Infallible>),
    #[error("CAR header declares no roots")]
    NoRoots,
}

/// A parsed CAR: the declared roots plus every block, keyed by CID.
pub struct Car {
    pub roots: Vec<Cid>,
    pub blocks: HashMap<Cid, Vec<u8>>,
}

impl Car {
    pub fn block(&self, cid: &Cid) -> Option<&[u8]> {
        self.blocks.get(cid).map(Vec::as_slice)
    }

    /// The commit block, which is the first root.
    pub fn root(&self) -> Result<&Cid, CarError> {
        self.roots.first().ok_or(CarError::NoRoots)
    }
}

/// Reads a varint, returning the value and how many bytes it used.
fn read_varint(bytes: &[u8], offset: usize) -> Result<(usize, usize), CarError> {
    let slice = bytes.get(offset..).ok_or(CarError::Varint(offset))?;
    let (value, rest) =
        unsigned_varint::decode::u64(slice).map_err(|_| CarError::Varint(offset))?;
    Ok((value as usize, slice.len() - rest.len()))
}

/// Parses a whole CAR from memory.
///
/// Repository CARs for a personal account are a few megabytes, so they are
/// read whole rather than streamed; the MST walk needs random access by CID
/// anyway, which streaming would not give.
pub fn parse(bytes: &[u8]) -> Result<Car, CarError> {
    let mut offset = 0usize;

    let (header_len, used) = read_varint(bytes, offset)?;
    offset += used;
    let header = bytes
        .get(offset..offset + header_len)
        .ok_or(CarError::Truncated {
            offset,
            expected: header_len,
        })?;
    offset += header_len;

    #[derive(serde::Deserialize)]
    struct Header {
        roots: Vec<Cid>,
    }
    let header: Header = serde_ipld_dagcbor::from_slice(header).map_err(CarError::Header)?;

    let mut blocks = HashMap::new();
    while offset < bytes.len() {
        let (block_len, used) = read_varint(bytes, offset)?;
        offset += used;

        let block = bytes
            .get(offset..offset + block_len)
            .ok_or(CarError::Truncated {
                offset,
                expected: block_len,
            })?;

        // The length covers the CID too, so the payload is what remains.
        let mut cursor = block;
        let cid =
            Cid::read_bytes(&mut cursor).map_err(|source| CarError::Cid { offset, source })?;
        let consumed = block_len - cursor.len();
        blocks.insert(cid, block[consumed..].to_vec());

        offset += block_len;
    }

    Ok(Car {
        roots: header.roots,
        blocks,
    })
}

/// The repository commit, whose `data` field roots the MST.
#[derive(Debug, serde::Deserialize)]
pub struct Commit {
    pub did: String,
    #[serde(default)]
    pub rev: Option<String>,
    /// Root of the record tree.
    pub data: Cid,
}

impl Car {
    pub fn commit(&self) -> Result<Commit, anyhow::Error> {
        let root = self.root()?;
        let bytes = self
            .block(root)
            .ok_or_else(|| anyhow::anyhow!("CAR root {root} is not present in the archive"))?;
        Ok(serde_ipld_dagcbor::from_slice(bytes)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ipld_core::ipld::Ipld;

    /// Builds a minimal but real CAR: a header plus one dag-cbor block, framed
    /// exactly as `com.atproto.sync.getRepo` frames them.
    fn build_car() -> (Vec<u8>, Cid, Vec<u8>) {
        let payload = serde_ipld_dagcbor::to_vec(&Ipld::Map(
            [("hello".to_string(), Ipld::String("world".into()))]
                .into_iter()
                .collect(),
        ))
        .unwrap();

        // dag-cbor codec (0x71) over sha2-256.
        let digest = cid::multihash::Multihash::wrap(
            0x12,
            <sha2::Sha256 as sha2::Digest>::digest(&payload).as_slice(),
        )
        .unwrap();
        let cid = Cid::new_v1(0x71, digest);

        let header = serde_ipld_dagcbor::to_vec(&Ipld::Map(
            [
                ("roots".to_string(), Ipld::List(vec![Ipld::Link(cid)])),
                ("version".to_string(), Ipld::Integer(1)),
            ]
            .into_iter()
            .collect(),
        ))
        .unwrap();

        let mut out = Vec::new();
        let mut buf = unsigned_varint::encode::u64_buffer();
        out.extend_from_slice(unsigned_varint::encode::u64(header.len() as u64, &mut buf));
        out.extend_from_slice(&header);

        let mut block = cid.to_bytes();
        block.extend_from_slice(&payload);
        let mut buf = unsigned_varint::encode::u64_buffer();
        out.extend_from_slice(unsigned_varint::encode::u64(block.len() as u64, &mut buf));
        out.extend_from_slice(&block);

        (out, cid, payload)
    }

    #[test]
    fn parses_roots_and_blocks() {
        let (car, cid, payload) = build_car();
        let parsed = parse(&car).expect("valid CAR");

        assert_eq!(parsed.roots, vec![cid]);
        assert_eq!(parsed.blocks.len(), 1);
        // The block length prefix includes the CID, so getting the payload
        // boundary wrong is the classic bug here.
        assert_eq!(parsed.block(&cid), Some(payload.as_slice()));
    }

    #[test]
    fn a_truncated_archive_is_an_error_not_a_panic() {
        let (car, _, _) = build_car();
        for cut in [1, car.len() / 2, car.len() - 1] {
            let err = parse(&car[..cut]);
            assert!(err.is_err(), "truncating at {cut} should fail");
        }
    }

    #[test]
    fn an_empty_archive_is_an_error() {
        assert!(parse(&[]).is_err());
    }

    #[test]
    fn garbage_is_rejected() {
        assert!(parse(&[0xff, 0xff, 0xff, 0xff]).is_err());
    }

    #[test]
    fn a_missing_root_block_is_reported() {
        let (car, _, _) = build_car();
        let mut parsed = parse(&car).unwrap();
        parsed.blocks.clear();
        let err = parsed.commit().expect_err("root is absent");
        assert!(err.to_string().contains("not present"), "{err}");
    }
}
