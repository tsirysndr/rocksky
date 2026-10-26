// PC/SC wire-protocol adapter ported from apps/cli (Apache-2.0).
const MARK = 165;
const PLC_LEN = 15;
const F_AUTH_PLC = 1;
const F_HAS_COLL = 2;
const F_COLL_DICT = 4;
const F_HAS_RKEY = 8;
const F_RKEY_TID = 16;
const F_AUTH_DICT = 32;
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const TID_B32 = "234567abcdefghijklmnopqrstuvwxyz";
const COLLECTIONS = [
  "app.rocksky.playlist",
  "app.rocksky.album",
  "app.rocksky.artist"
];
const FAV_MARK = 166;
const FAV_PLC = 1;
const FAVORITES_PREFIX = "rocksky://favorites/";
const isFavorites = (data) => data[0] === FAV_MARK;
function encodeFavorites(did) {
  let flags = 0;
  const body = [];
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
function decodeFavorites(data) {
  if (data[0] !== FAV_MARK || data.length < 2) return null;
  const flags = data[1];
  let p = 2;
  let did;
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
const looksLikeAtUri = (s) => s.startsWith("at://");
const isEncoded = (data) => data[0] === MARK;
function encodeAtUri(uri) {
  if (!uri.startsWith("at://")) throw new Error("not an at:// URI");
  const segs = uri.slice("at://".length).split("/");
  if (!segs[0] || segs.length > 3) {
    throw new Error(
      `unsupported at:// URI: expected authority[/collection[/rkey]], got ${JSON.stringify(uri)}`
    );
  }
  let flags = 0;
  const body = [];
  const plc = plcBytes(segs[0]);
  if (plc) {
    flags |= F_AUTH_PLC;
    body.push(...plc);
  } else {
    pushLit(body, Buffer.from(segs[0], "utf8"));
  }
  if (segs[1] !== void 0) {
    const idx = COLLECTIONS.indexOf(segs[1]);
    if (idx < 0) {
      throw new Error(
        `unknown collection ${JSON.stringify(segs[1])}; known: ${COLLECTIONS.join(", ")}`
      );
    }
    flags |= F_HAS_COLL | F_COLL_DICT;
    body.push(idx);
  }
  if (segs[2] !== void 0) {
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
  const back = decodeAtUri(out);
  if (!back || back.uri !== uri) {
    throw new Error("internal error: URI did not round-trip");
  }
  return out;
}
function decodeAtUri(data) {
  if (data[0] !== MARK || data.length < 2) return null;
  const flags = data[1];
  let p = 2;
  let authority;
  if (flags & F_AUTH_DICT) {
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
    let coll;
    if (flags & F_COLL_DICT) {
      const idx = data[p];
      if (idx === void 0 || !COLLECTIONS[idx]) return null;
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
    let rkey;
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
function plcBytes(authority) {
  if (!authority.startsWith("did:plc:")) return null;
  const id = authority.slice("did:plc:".length);
  const raw = b32Decode(id);
  if (!raw || raw.length !== PLC_LEN || b32Encode(raw) !== id) return null;
  return raw;
}
function pushLit(body, bytes) {
  if (bytes.length > 255) throw new Error("value is too long to store");
  body.push(bytes.length, ...bytes);
}
function readLit(data, p) {
  const len = data[p];
  if (len === void 0) return null;
  const bytes = data.subarray(p + 1, p + 1 + len);
  if (bytes.length < len) return null;
  return { bytes, next: p + 1 + len };
}
function b32Encode(raw) {
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const byte of raw) {
    acc = acc << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[acc >> bits & 31];
    }
  }
  if (bits > 0) out += B32[acc << 5 - bits & 31];
  return out;
}
function b32Decode(s) {
  const out = [];
  let acc = 0;
  let bits = 0;
  for (const c of s) {
    const v = B32.indexOf(c);
    if (v < 0) return null;
    acc = acc << 5 | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push(acc >> bits & 255);
    }
  }
  return Buffer.from(out);
}
function packTid(rk) {
  if (rk.length !== 13) return null;
  let acc = 0n;
  for (const c of rk) {
    const v = TID_B32.indexOf(c);
    if (v < 0) return null;
    acc = acc << 5n | BigInt(v);
  }
  if (acc >= 1n << 64n) return null;
  const packed = Buffer.alloc(8);
  packed.writeBigUInt64BE(acc);
  return unpackTid(packed) === rk ? packed : null;
}
function unpackTid(b) {
  let acc = b.readBigUInt64BE();
  const chars = [];
  for (let i = 0; i < 13; i++) {
    chars.unshift(TID_B32[Number(acc & 0x1fn)]);
    acc >>= 5n;
  }
  return chars.join("");
}
export {
  COLLECTIONS,
  FAVORITES_PREFIX,
  decodeAtUri,
  decodeFavorites,
  encodeAtUri,
  encodeFavorites,
  isEncoded,
  isFavorites,
  looksLikeAtUri
};
