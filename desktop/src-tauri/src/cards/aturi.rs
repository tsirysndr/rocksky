//! Compact, lossless encoding for AT-URIs so they fit in a small card file.
//!
//! Ported from card-inspect (~/Documents/github/card-inspect, src/aturi.rs) and
//! kept byte-compatible with it, so a card written by either tool reads in the
//! other. Reversible tricks:
//!   * `did:plc:` identifiers (24 base32 chars) pack back into 15 raw bytes.
//!     Other authorities (e.g. `did:web:…`) are stored literally.
//!   * Known collection NSIDs become a 1-byte dictionary index.
//!   * Record keys that are TIDs (13 base32-sortable chars) pack into 8 bytes.
//!
//! On-card layout — the first byte is a marker plain UTF-8 text can't start with:
//!   0xA5 <flags> <authority> [collection] [rkey]
//!
//! Decoding stops as soon as it has consumed those fields and reports how far it
//! got, so a caller may store more of its own data straight after the blob. That
//! is how the library-id fallback record rides along on the same card.

const MARK: u8 = 0xA5;
const PLC_LEN: usize = 15;

const F_AUTH_PLC: u8 = 0b0000_0001;
const F_HAS_COLL: u8 = 0b0000_0010;
const F_COLL_DICT: u8 = 0b0000_0100;
const F_HAS_RKEY: u8 = 0b0000_1000;
const F_RKEY_TID: u8 = 0b0001_0000;
const F_AUTH_DICT: u8 = 0b0010_0000;

const B32: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyz234567";
const TID_B32: &[u8; 32] = b"234567abcdefghijklmnopqrstuvwxyz";

/// The collection NSIDs that encode to a 1-byte index.
///
/// **Index-addressed and append-only.** The index *is* the stored value, so
/// reordering or removing an entry re-points every card already written — an
/// album would come back as a playlist. Only ever append.
///
/// This order is not ours to choose: it mirrors card-inspect's
/// `DEFAULT_COLLECTIONS` (src/config.rs) byte for byte, which is what makes a
/// card written by either tool decode correctly in the other.
pub const COLLECTIONS: &[&str] = &[
    "app.rocksky.playlist",
    "app.rocksky.album",
    "app.rocksky.artist",
];

pub fn looks_like_aturi(s: &str) -> bool {
    s.starts_with("at://")
}

pub fn is_encoded(data: &[u8]) -> bool {
    data.first() == Some(&MARK)
}

/// Encode an `at://` URI to its compact byte form.
///
/// Errors rather than falling back when the URI can't be represented — notably
/// an unknown collection — so an oversized URI is never silently stored.
pub fn encode(uri: &str) -> Result<Vec<u8>, String> {
    let rest = uri
        .strip_prefix("at://")
        .ok_or_else(|| "not an at:// URI".to_string())?;
    let segs: Vec<&str> = rest.split('/').collect();
    if segs[0].is_empty() || segs.len() > 3 {
        return Err(format!(
            "unsupported at:// URI: expected authority[/collection[/rkey]], got {uri:?}"
        ));
    }

    let mut flags = 0u8;
    let mut body = Vec::new();

    // Authority: did:plc packs to 15 bytes, anything else is stored literally.
    if let Some(raw) = plc_bytes(segs[0]) {
        flags |= F_AUTH_PLC;
        body.extend_from_slice(&raw);
    } else {
        push_lit(&mut body, segs[0].as_bytes())
            .ok_or_else(|| "authority is too long".to_string())?;
    }

    if let Some(&coll) = segs.get(1) {
        let idx = dict_index(COLLECTIONS, coll).ok_or_else(|| {
            format!(
                "unknown collection {coll:?}; known collections: {}",
                COLLECTIONS.join(", ")
            )
        })?;
        flags |= F_HAS_COLL | F_COLL_DICT;
        body.push(idx);
    }

    if let Some(&rk) = segs.get(2) {
        flags |= F_HAS_RKEY;
        match pack_tid(rk) {
            Some(t) => {
                flags |= F_RKEY_TID;
                body.extend_from_slice(&t);
            }
            None => {
                push_lit(&mut body, rk.as_bytes())
                    .ok_or_else(|| "record key is too long".to_string())?;
            }
        }
    }

    let mut out = vec![MARK, flags];
    out.extend_from_slice(&body);

    // Safety net: what we store must reconstruct the exact input.
    match decode(&out) {
        Some((back, _)) if back == uri => Ok(out),
        _ => Err("internal error: URI did not round-trip".to_string()),
    }
}

/// Decode a compact AT-URI, returning it and how many bytes it occupied.
///
/// The length matters: anything after the blob is the caller's, not ours.
pub fn decode(data: &[u8]) -> Option<(String, usize)> {
    if data.first() != Some(&MARK) {
        return None;
    }
    let flags = *data.get(1)?;
    let mut p = 2usize;

    let authority = if flags & F_AUTH_DICT != 0 {
        // Written by a tool with an authority dictionary we don't share. The
        // index means nothing here, so the URI is not reconstructable.
        return None;
    } else if flags & F_AUTH_PLC != 0 {
        let raw = data.get(p..p + PLC_LEN)?;
        p += PLC_LEN;
        format!("did:plc:{}", b32_encode(raw))
    } else {
        let (b, np) = read_lit(data, p)?;
        p = np;
        String::from_utf8_lossy(b).into_owned()
    };
    let mut uri = format!("at://{authority}");

    if flags & F_HAS_COLL != 0 {
        let coll = if flags & F_COLL_DICT != 0 {
            let idx = *data.get(p)?;
            p += 1;
            COLLECTIONS.get(idx as usize)?.to_string()
        } else {
            let (b, np) = read_lit(data, p)?;
            p = np;
            String::from_utf8_lossy(b).into_owned()
        };
        uri.push('/');
        uri.push_str(&coll);
    }

    if flags & F_HAS_RKEY != 0 {
        let rkey = if flags & F_RKEY_TID != 0 {
            let b = data.get(p..p + 8)?;
            p += 8;
            unpack_tid(b)?
        } else {
            let (b, np) = read_lit(data, p)?;
            p = np;
            String::from_utf8_lossy(b).into_owned()
        };
        uri.push('/');
        uri.push_str(&rkey);
    }

    Some((uri, p))
}

// --- helpers ---------------------------------------------------------------

fn dict_index(list: &[&str], value: &str) -> Option<u8> {
    list.iter()
        .position(|v| *v == value)
        .filter(|&i| i <= u8::MAX as usize)
        .map(|i| i as u8)
}

/// The 15 raw bytes of a `did:plc:` authority, if it is a canonical one.
fn plc_bytes(authority: &str) -> Option<[u8; PLC_LEN]> {
    let id = authority.strip_prefix("did:plc:")?;
    let raw = b32_decode(id)?;
    if raw.len() == PLC_LEN && b32_encode(&raw) == id {
        raw.try_into().ok()
    } else {
        None
    }
}

fn push_lit(body: &mut Vec<u8>, bytes: &[u8]) -> Option<()> {
    if bytes.len() > 255 {
        return None;
    }
    body.push(bytes.len() as u8);
    body.extend_from_slice(bytes);
    Some(())
}

fn read_lit(data: &[u8], p: usize) -> Option<(&[u8], usize)> {
    let len = *data.get(p)? as usize;
    let b = data.get(p + 1..p + 1 + len)?;
    Some((b, p + 1 + len))
}

fn b32_encode(raw: &[u8]) -> String {
    let mut out = String::new();
    let mut acc = 0u16;
    let mut bits = 0u8;
    for &byte in raw {
        acc = (acc << 8) | byte as u16;
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(B32[((acc >> bits) & 0x1F) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(B32[((acc << (5 - bits)) & 0x1F) as usize] as char);
    }
    out
}

fn b32_decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut acc = 0u16;
    let mut bits = 0u8;
    for c in s.bytes() {
        let v = B32.iter().position(|&b| b == c)? as u16;
        acc = (acc << 5) | v;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    Some(out)
}

/// A TID record key is 13 characters of the sortable base32 alphabet, which is
/// 65 bits — one more than 8 bytes. The leading character of a real TID is
/// always within the low 4 bits, so the top bit is dropped and restored.
fn pack_tid(rk: &str) -> Option<[u8; 8]> {
    if rk.len() != 13 {
        return None;
    }
    let mut acc = 0u128;
    for c in rk.bytes() {
        let v = TID_B32.iter().position(|&b| b == c)? as u128;
        acc = (acc << 5) | v;
    }
    if acc >= 1u128 << 64 {
        return None;
    }
    let packed = (acc as u64).to_be_bytes();
    // Only claim the packing if it round-trips exactly.
    (unpack_tid(&packed).as_deref() == Some(rk)).then_some(packed)
}

fn unpack_tid(b: &[u8]) -> Option<String> {
    let arr: [u8; 8] = b.try_into().ok()?;
    let mut acc = u64::from_be_bytes(arr) as u128;
    let mut chars = [0u8; 13];
    for slot in chars.iter_mut().rev() {
        *slot = TID_B32[(acc & 0x1F) as usize];
        acc >>= 5;
    }
    String::from_utf8(chars.to_vec()).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALBUM: &str = "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.album/3lhlttyitus2k";
    const PLAYLIST: &str =
        "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.playlist/3mttndjwxh223";

    #[test]
    fn roundtrips_the_uris_tags_carry() {
        for uri in [ALBUM, PLAYLIST] {
            let enc = encode(uri).expect("encodes");
            assert_eq!(decode(&enc).map(|(u, _)| u).as_deref(), Some(uri));
        }
    }

    /// The whole point on ACOS: the URI has to shrink enough to fit a record
    /// file. 26 bytes for what is 68 characters as text.
    #[test]
    fn packs_a_plc_album_uri_into_26_bytes() {
        let enc = encode(ALBUM).unwrap();
        assert_eq!(enc.len(), 26, "0xA5 + flags + 15 plc + 1 coll + 8 tid");
        assert_eq!(ALBUM.len(), 69);
        assert!(
            enc.len() * 2 < ALBUM.len(),
            "must be under half the plain-text length"
        );
    }

    /// Decoding reports where the blob ends, so a caller can store its own
    /// bytes immediately after it — which is how the fallback record rides on
    /// the same card.
    #[test]
    fn reports_its_length_and_ignores_what_follows() {
        let mut buf = encode(ALBUM).unwrap();
        let blob_len = buf.len();
        buf.extend_from_slice(b"\nrocksky://library/album/rec_abc");

        let (uri, used) = decode(&buf).expect("decodes");
        assert_eq!(uri, ALBUM);
        assert_eq!(used, blob_len, "must not swallow the trailing record");
        assert_eq!(&buf[used..][..1], b"\n");
    }

    #[test]
    fn refuses_an_unknown_collection() {
        let err = encode("at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.bsky.feed.post/3lhlttyitus2k")
            .unwrap_err();
        assert!(err.contains("unknown collection"), "{err}");
    }

    /// A non-plc authority still works, just less compactly.
    #[test]
    fn stores_a_did_web_authority_literally() {
        let uri = "at://did:web:example.com/app.rocksky.album/3lhlttyitus2k";
        let enc = encode(uri).unwrap();
        assert_eq!(decode(&enc).map(|(u, _)| u).as_deref(), Some(uri));
    }

    /// The dictionary is index-addressed, so its order is a storage format, and
    /// it is shared with card-inspect. Getting this wrong doesn't fail loudly —
    /// an album silently reads back as a playlist. Pinned against
    /// card-inspect's DEFAULT_COLLECTIONS (src/config.rs).
    #[test]
    fn collection_indices_match_card_inspect() {
        assert_eq!(COLLECTIONS[0], "app.rocksky.playlist");
        assert_eq!(COLLECTIONS[1], "app.rocksky.album");
        assert_eq!(COLLECTIONS[2], "app.rocksky.artist");
    }

    /// The album URI's collection byte must be index 1, as card-inspect writes
    /// it. The blob is otherwise opaque, so this is the byte that would rot.
    #[test]
    fn album_encodes_to_collection_index_one() {
        let enc = encode(ALBUM).unwrap();
        // 0xA5, flags, then 15 plc bytes, then the collection index.
        assert_eq!(enc[2 + PLC_LEN], 1, "album is index 1");
        let enc = encode(PLAYLIST).unwrap();
        assert_eq!(enc[2 + PLC_LEN], 0, "playlist is index 0");
    }

    /// Pinned against bytes produced by card-inspect's own encoder, run against
    /// its built-in dictionary. This is the contract that lets a card written
    /// here be read there; the collection index is one byte in the middle of an
    /// otherwise opaque blob, so a drift would not fail loudly.
    #[test]
    fn matches_card_inspect_byte_for_byte() {
        let hex = |b: &[u8]| b.iter().map(|x| format!("{x:02X}")).collect::<String>();
        assert_eq!(
            hex(&encode(ALBUM).unwrap()),
            "A51FFD46B323412AC8BCFD8CA5DD0494510118B639CF9D9D6010"
        );
        assert_eq!(
            hex(&encode(PLAYLIST).unwrap()),
            "A51FFD46B323412AC8BCFD8CA5DD049451001967334BF9D68001"
        );
    }

    #[test]
    fn rejects_data_that_isnt_ours() {
        assert!(!is_encoded(b"at://plain/text"));
        assert!(decode(b"at://plain/text").is_none());
        assert!(decode(&[MARK]).is_none(), "truncated blob");
    }
}
