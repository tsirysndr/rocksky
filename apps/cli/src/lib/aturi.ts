// Compact, lossless encoding for AT-URIs so they fit in a small card file.
//
// A TypeScript port of desktop/src-tauri/src/cards/aturi.rs, which is itself
// ported from card-inspect. All three produce identical bytes — there is a test
// pinning this one against vectors taken from card-inspect's own encoder — so a
// card written by any of them reads in the others.
//
// On-card layout, the first byte being one plain UTF-8 text cannot start with:
//   0xA5 <flags> <authority> [collection] [rkey]
//
// Decoding reports how many bytes it consumed, so a caller may store its own
// data straight after the blob. That is how the library-id fallback rides along.

const MARK = 0xa5;
const PLC_LEN = 15;

const F_AUTH_PLC = 0b0000_0001;
const F_HAS_COLL = 0b0000_0010;
const F_COLL_DICT = 0b0000_0100;
const F_HAS_RKEY = 0b0000_1000;
const F_RKEY_TID = 0b0001_0000;
const F_AUTH_DICT = 0b0010_0000;

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const TID_B32 = "234567abcdefghijklmnopqrstuvwxyz";

/**
 * Collection NSIDs that encode to a 1-byte index.
 *
 * **Index-addressed and append-only.** The index *is* the stored value, so
 * reordering or removing an entry re-points every card already written — an
 * album would come back as a playlist. Only ever append.
 *
 * This order is not ours to choose: it mirrors card-inspect's
 * DEFAULT_COLLECTIONS (src/config.rs) and the desktop's COLLECTIONS, which is
 * what makes a card written by any of them decode correctly in the others.
 */
export const COLLECTIONS = [
  "app.rocksky.playlist",
  "app.rocksky.album",
  "app.rocksky.artist",
];

/**
 * Marker for a compact favorites reference. Distinct from MARK, and like it a
 * byte plain UTF-8 text cannot start with.
 *
 * Favorites are a query owned by a person, not a record, so there is no AT-URI
 * to pack — the card names the person instead. Written as text that is roughly
 * sixty characters, which an ACOS3 user file (28 bytes on a real card) cannot
 * hold; packed like a did:plc authority it is 17.
 *
 * Ours alone: card-inspect knows nothing about favorites and shows such a card
 * as unrecognised rather than mis-decoding it.
 */
const FAV_MARK = 0xa6;
const FAV_PLC = 0b0000_0001;

export const FAVORITES_PREFIX = "rocksky://favorites/";

export const isFavorites = (data: Buffer) => data[0] === FAV_MARK;

/** Encode `rocksky://favorites/<did>`; `did` is the raw identifier. */
export function encodeFavorites(did: string): Buffer {
  let flags = 0;
  const body: number[] = [];
  const plc = plcBytes(did);
  if (plc) {
    flags |= FAV_PLC;
    body.push(...plc);
  } else {
    pushLit(body, Buffer.from(did, "utf8"));
  }
  const out = Buffer.from([FAV_MARK, flags, ...body]);
  const back = decodeFavorites(out);
  if (!back || back.uri !== `${FAVORITES_PREFIX}${did}`) {
    throw new Error("internal error: favorites did not round-trip");
  }
  return out;
}

/** Decode a compact favorites reference and how many bytes it occupied. */
export function decodeFavorites(
  data: Buffer,
): { uri: string; used: number } | null {
  if (data[0] !== FAV_MARK || data.length < 2) return null;
  const flags = data[1];
  let p = 2;
  let did: string;
  if (flags & FAV_PLC) {
    const raw = data.subarray(p, p + PLC_LEN);
    if (raw.length < PLC_LEN) return null;
    p += PLC_LEN;
    did = `did:plc:${b32Encode(raw)}`;
  } else {
    const lit = readLit(data, p);
    if (!lit) return null;
    did = lit.bytes.toString("utf8");
    p = lit.next;
  }
  return { uri: `${FAVORITES_PREFIX}${did}`, used: p };
}

export const looksLikeAtUri = (s: string) => s.startsWith("at://");
export const isEncoded = (data: Buffer) => data[0] === MARK;

/** Encode an `at://` URI to its compact form, or throw explaining why not. */
export function encodeAtUri(uri: string): Buffer {
  if (!uri.startsWith("at://")) throw new Error("not an at:// URI");
  const segs = uri.slice("at://".length).split("/");
  if (!segs[0] || segs.length > 3) {
    throw new Error(
      `unsupported at:// URI: expected authority[/collection[/rkey]], got ${JSON.stringify(uri)}`,
    );
  }

  let flags = 0;
  const body: number[] = [];

  const plc = plcBytes(segs[0]);
  if (plc) {
    flags |= F_AUTH_PLC;
    body.push(...plc);
  } else {
    pushLit(body, Buffer.from(segs[0], "utf8"));
  }

  if (segs[1] !== undefined) {
    const idx = COLLECTIONS.indexOf(segs[1]);
    if (idx < 0) {
      throw new Error(
        `unknown collection ${JSON.stringify(segs[1])}; known: ${COLLECTIONS.join(", ")}`,
      );
    }
    flags |= F_HAS_COLL | F_COLL_DICT;
    body.push(idx);
  }

  if (segs[2] !== undefined) {
    flags |= F_HAS_RKEY;
    const tid = packTid(segs[2]);
    if (tid) {
      flags |= F_RKEY_TID;
      body.push(...tid);
    } else {
      pushLit(body, Buffer.from(segs[2], "utf8"));
    }
  }

  const out = Buffer.from([MARK, flags, ...body]);
  // Safety net: what we store must reconstruct the exact input.
  const back = decodeAtUri(out);
  if (!back || back.uri !== uri) {
    throw new Error("internal error: URI did not round-trip");
  }
  return out;
}

/** Decode a compact AT-URI, with the number of bytes it occupied. */
export function decodeAtUri(
  data: Buffer,
): { uri: string; used: number } | null {
  if (data[0] !== MARK || data.length < 2) return null;
  const flags = data[1];
  let p = 2;

  let authority: string;
  if (flags & F_AUTH_DICT) {
    // Written with an authority dictionary we don't share, so the index means
    // nothing here and the URI is not reconstructable.
    return null;
  }
  if (flags & F_AUTH_PLC) {
    const raw = data.subarray(p, p + PLC_LEN);
    if (raw.length < PLC_LEN) return null;
    p += PLC_LEN;
    authority = `did:plc:${b32Encode(raw)}`;
  } else {
    const lit = readLit(data, p);
    if (!lit) return null;
    authority = lit.bytes.toString("utf8");
    p = lit.next;
  }
  let uri = `at://${authority}`;

  if (flags & F_HAS_COLL) {
    let coll: string;
    if (flags & F_COLL_DICT) {
      const idx = data[p];
      if (idx === undefined || !COLLECTIONS[idx]) return null;
      coll = COLLECTIONS[idx];
      p += 1;
    } else {
      const lit = readLit(data, p);
      if (!lit) return null;
      coll = lit.bytes.toString("utf8");
      p = lit.next;
    }
    uri += `/${coll}`;
  }

  if (flags & F_HAS_RKEY) {
    let rkey: string;
    if (flags & F_RKEY_TID) {
      const b = data.subarray(p, p + 8);
      if (b.length < 8) return null;
      p += 8;
      rkey = unpackTid(b);
    } else {
      const lit = readLit(data, p);
      if (!lit) return null;
      rkey = lit.bytes.toString("utf8");
      p = lit.next;
    }
    uri += `/${rkey}`;
  }

  return { uri, used: p };
}

// --- helpers ---------------------------------------------------------------

/** The 15 raw bytes of a `did:plc:` authority, if it is a canonical one. */
function plcBytes(authority: string): Buffer | null {
  if (!authority.startsWith("did:plc:")) return null;
  const id = authority.slice("did:plc:".length);
  const raw = b32Decode(id);
  if (!raw || raw.length !== PLC_LEN || b32Encode(raw) !== id) return null;
  return raw;
}

function pushLit(body: number[], bytes: Buffer) {
  if (bytes.length > 255) throw new Error("value is too long to store");
  body.push(bytes.length, ...bytes);
}

function readLit(data: Buffer, p: number): { bytes: Buffer; next: number } | null {
  const len = data[p];
  if (len === undefined) return null;
  const bytes = data.subarray(p + 1, p + 1 + len);
  if (bytes.length < len) return null;
  return { bytes, next: p + 1 + len };
}

function b32Encode(raw: Buffer): string {
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const byte of raw) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(acc >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 0x1f];
  return out;
}

function b32Decode(s: string): Buffer | null {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const c of s) {
    const v = B32.indexOf(c);
    if (v < 0) return null;
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/**
 * A TID record key is 13 characters of the sortable base32 alphabet — 65 bits,
 * one more than 8 bytes. A real TID's leading character always fits the low 4
 * bits, so the packing only claims a key that round-trips exactly.
 *
 * BigInt rather than Number: 64 bits does not fit a double's 53-bit mantissa.
 */
function packTid(rk: string): Buffer | null {
  if (rk.length !== 13) return null;
  let acc = 0n;
  for (const c of rk) {
    const v = TID_B32.indexOf(c);
    if (v < 0) return null;
    acc = (acc << 5n) | BigInt(v);
  }
  if (acc >= 1n << 64n) return null;
  const packed = Buffer.alloc(8);
  packed.writeBigUInt64BE(acc);
  return unpackTid(packed) === rk ? packed : null;
}

function unpackTid(b: Buffer): string {
  let acc = b.readBigUInt64BE();
  const chars: string[] = [];
  for (let i = 0; i < 13; i++) {
    chars.unshift(TID_B32[Number(acc & 0x1fn)]);
    acc >>= 5n;
  }
  return chars.join("");
}
