// PC/SC wire-protocol adapter ported from apps/cli (Apache-2.0).
import {
  FAVORITES_PREFIX,
  decodeAtUri,
  decodeFavorites,
  encodeAtUri,
  encodeFavorites,
  isEncoded,
  isFavorites,
  looksLikeAtUri
} from "./aturi_ffi.mjs";
const SLE5528_ATR = Buffer.from([59, 4, 146, 35, 16, 145]);
const ACOS3_ATR = Buffer.from([
  59,
  190,
  17,
  0,
  0,
  65,
  1,
  56,
  0,
  0,
  4,
  0,
  0,
  0,
  0,
  0,
  1,
  144,
  0
]);
const SLE5528_SIZE = 1024;
const SLE_DATA_OFFSET = 32;
const SLE_WRITE_SPAN = 256;
const ACOS_USER_FILE = Buffer.from([255, 4]);
const ACOS_ISSUER_CODE_REF = 7;
function cardKindFromAtr(atr) {
  if (atr.equals(SLE5528_ATR)) return "sle5528";
  if (atr.equals(ACOS3_ATR)) return "acos3";
  return null;
}
function cardSecret(kind) {
  return kind === "sle5528" ? { label: "PSC", fallback: "FFFF" } : { label: "PIN", fallback: "ACOSTEST" };
}
const cardLabel = (kind) => kind === "sle5528" ? "SLE5528 memory card" : "ACOS3 card";
const sw = (r) => r.length >= 2 ? [r[r.length - 2], r[r.length - 1]] : [0, 0];
const hex = (n) => n.toString(16).padStart(2, "0").toUpperCase();
function expectOk(r) {
  if (r.length < 2) throw new Error("response too short");
  const [a, b] = sw(r);
  if (a !== 144 || b !== 0) {
    throw new Error(`card returned SW ${hex(a)} ${hex(b)}`);
  }
  return r.subarray(0, r.length - 2);
}
function encodePayloads(payloads) {
  const [first, ...rest] = payloads;
  if (!first) throw new Error("nothing to write");
  const head = looksLikeAtUri(first) ? encodeAtUri(first) : first.startsWith(FAVORITES_PREFIX) ? (
    // The webview percent-encodes the DID into the URL; the packing wants
    // the identifier itself.
    encodeFavorites(decodeURIComponent(first.slice(FAVORITES_PREFIX.length)))
  ) : Buffer.from(first, "utf8");
  const parts = [head];
  for (const extra of rest) {
    parts.push(Buffer.from(`
${extra}`, "utf8"));
  }
  return Buffer.concat(parts);
}
function fitPayloads(payloads, capacity) {
  let take = payloads.length;
  while (take > 1) {
    try {
      if (encodePayloads(payloads.slice(0, take)).length <= capacity) break;
    } catch {
    }
    take -= 1;
  }
  return payloads.slice(0, take);
}
function decodePayloads(data) {
  const fill = (b) => b === 255 || b === 0;
  let start = 0;
  while (start < data.length && fill(data[start])) start += 1;
  data = data.subarray(start);
  if (data.length === 0) return [];
  const out = [];
  let rest = data;
  if (isFavorites(data)) {
    const fav = decodeFavorites(data);
    if (!fav) return [];
    out.push(fav.uri);
    rest = data.subarray(fav.used);
  } else {
    const decoded = decodeAtUri(data);
    if (decoded) {
      out.push(decoded.uri);
      rest = data.subarray(decoded.used);
    } else if (isEncoded(data)) {
      return [];
    }
  }
  let end = rest.length;
  while (end > 0 && fill(rest[end - 1])) end -= 1;
  for (const line of rest.subarray(0, end).toString("utf8").split("\n")) {
    const trimmed = line.replace(/^[\s\0]+|[\s\0]+$/g, "");
    if (trimmed) out.push(trimmed);
  }
  return out;
}
async function sleSelectType(tx) {
  expectOk(await tx(Buffer.from([255, 164, 0, 0, 1, 5])));
}
async function sleErrorCounter(tx) {
  const r = expectOk(await tx(Buffer.from([255, 177, 0, 0, 3])));
  return r.length ? r[0] : null;
}
async function sleRead(tx, offset, length) {
  if (offset + length > SLE5528_SIZE) {
    throw new Error(
      `read ${offset}..${offset + length} is out of range (card is ${SLE5528_SIZE} bytes)`
    );
  }
  const parts = [];
  for (let addr = offset; addr < offset + length; ) {
    const chunk = Math.min(32, offset + length - addr);
    parts.push(
      expectOk(
        await tx(Buffer.from([255, 176, addr >> 8 & 255, addr & 255, chunk]))
      )
    );
    addr += chunk;
  }
  return Buffer.concat(parts);
}
async function slePresentPsc(tx, psc) {
  const r = await tx(Buffer.concat([Buffer.from([255, 32, 0, 0, psc.length]), psc]));
  if (r.length < 2) throw new Error("PSC verification: response too short");
  const [a, ec] = sw(r);
  if (a === 144 && ec === 255) return;
  if (a === 144 && ec === 0) {
    throw new Error("that code was wrong and the card is now locked");
  }
  if (a === 144) {
    const left = ec.toString(2).split("1").length - 1;
    throw new Error(
      `wrong code \u2014 ${left} attempt(s) left before the card locks permanently`
    );
  }
  throw new Error(`PSC verification failed: SW ${hex(a)} ${hex(ec)}`);
}
async function sleWrite(tx, offset, data) {
  if (offset + data.length > SLE5528_SIZE) {
    throw new Error(
      `write ${offset}..${offset + data.length} is out of range (card is ${SLE5528_SIZE} bytes)`
    );
  }
  let addr = offset;
  for (let i = 0; i < data.length; i += 16) {
    const chunk = data.subarray(i, i + 16);
    const apdu = Buffer.concat([
      Buffer.from([255, 208, addr >> 8 & 255, addr & 255, chunk.length]),
      chunk
    ]);
    try {
      expectOk(await tx(apdu));
    } catch (e) {
      throw new Error(`${e.message} at byte ${addr}`);
    }
    addr += chunk.length;
  }
}
const CLA = 128;
async function acosSelectFile(tx, fileId) {
  const r = await tx(
    Buffer.concat([Buffer.from([CLA, 164, 0, 0, fileId.length]), fileId])
  );
  const [a, b] = sw(r);
  if (a === 144 && b === 0) return;
  if (a === 106 && b === 130) throw new Error("the card has no such file (6A 82)");
  throw new Error(`SELECT FILE failed: SW ${hex(a)} ${hex(b)}`);
}
async function acosRecordLen(tx) {
  let len = 0;
  for (let le = 1; le <= 255; le++) {
    const [a, b] = sw(await tx(Buffer.from([CLA, 178, 0, 0, le])));
    if (a === 144 && b === 0) len = le;
    else if (a === 103 && b === 0) break;
    else if (a === 106 && b === 131) break;
    else if (a === 105 && b === 130) {
      throw new Error("this file needs a code before it can be read");
    } else throw new Error(`READ RECORD probe failed: SW ${hex(a)} ${hex(b)}`);
  }
  if (len === 0) {
    throw new Error("could not determine the record length (file empty or protected)");
  }
  return len;
}
async function acosRecordCount(tx, reclen) {
  let n = 0;
  while (n <= 255) {
    const [a, b] = sw(await tx(Buffer.from([CLA, 178, n, 0, reclen])));
    if (a === 144 && b === 0) n += 1;
    else if (a === 106 && b === 131) break;
    else if (a === 105 && b === 130) break;
    else throw new Error(`record-count probe: SW ${hex(a)} ${hex(b)}`);
  }
  return n;
}
async function acosReadRecords(tx, start, reclen, maxBytes) {
  const parts = [];
  let total = 0;
  for (let rec = start; rec <= 255; rec++) {
    if (maxBytes !== void 0 && total >= maxBytes) break;
    const r = await tx(Buffer.from([CLA, 178, rec, 0, reclen]));
    const [a, b] = sw(r);
    if (a === 144 && b === 0) {
      const body = r.subarray(0, r.length - 2);
      parts.push(body);
      total += body.length;
    } else if (a === 106 && b === 131) break;
    else throw new Error(`READ RECORD ${rec} failed: SW ${hex(a)} ${hex(b)}`);
  }
  const out = Buffer.concat(parts);
  return maxBytes === void 0 ? out : out.subarray(0, maxBytes);
}
async function acosWriteRecords(tx, start, reclen, data) {
  for (let i = 0; i * reclen < data.length; i++) {
    const rec = Buffer.alloc(reclen);
    data.copy(rec, 0, i * reclen, Math.min((i + 1) * reclen, data.length));
    const [a, b] = sw(
      await tx(Buffer.concat([Buffer.from([CLA, 210, start + i, 0, reclen]), rec]))
    );
    if (a === 144 && b === 0) continue;
    if (a === 105 && b === 130) {
      throw new Error(
        `record ${start + i} is protected \u2014 the code was not accepted for writing`
      );
    }
    if (a === 106 && b === 131) {
      throw new Error(`record ${start + i} is past the end of the file`);
    }
    throw new Error(`WRITE RECORD ${start + i} failed: SW ${hex(a)} ${hex(b)}`);
  }
}
async function acosClearRecordsFrom(tx, start, reclen) {
  const zeros = Buffer.alloc(reclen);
  let cleared = 0;
  for (let rec = start; rec <= 255; rec++) {
    const [a, b] = sw(
      await tx(Buffer.concat([Buffer.from([CLA, 210, rec, 0, reclen]), zeros]))
    );
    if (a === 144 && b === 0) cleared += 1;
    else if (a === 106 && b === 131) break;
    else throw new Error(`clearing record ${rec} failed: SW ${hex(a)} ${hex(b)}`);
  }
  return cleared;
}
async function acosSubmitCode(tx, codeRef, code) {
  const [a, b] = sw(
    await tx(Buffer.concat([Buffer.from([CLA, 32, codeRef, 0, code.length]), code]))
  );
  if (a === 144 && b === 0) return;
  if (a === 99) throw new Error(`wrong code \u2014 ${b & 15} attempt(s) left before it blocks`);
  if (a === 105 && b === 131) throw new Error("that code is blocked (69 83)");
  throw new Error(`SUBMIT CODE failed: SW ${hex(a)} ${hex(b)}`);
}
async function readCard(tx, kind) {
  const data = kind === "sle5528" ? (await sleSelectType(tx), await sleRead(tx, SLE_DATA_OFFSET, SLE_WRITE_SPAN)) : await (async () => {
    await acosSelectFile(tx, ACOS_USER_FILE);
    return acosReadRecords(tx, 0, await acosRecordLen(tx));
  })();
  return decodePayloads(data);
}
async function writeCard(tx, kind, payloads, secret) {
  if (kind === "sle5528") {
    const psc = parseHex(secret);
    if (!psc) throw new Error(`the PSC must be hex digits, got ${JSON.stringify(secret)}`);
    const fitted2 = fitPayloads(payloads, SLE_WRITE_SPAN);
    const data2 = Buffer.alloc(SLE_WRITE_SPAN, 255);
    encodePayloads(fitted2).copy(data2);
    await sleSelectType(tx);
    if (await sleErrorCounter(tx) === 0) {
      throw new Error("this card's security code is locked; it can't be written");
    }
    await slePresentPsc(tx, psc);
    await sleWrite(tx, SLE_DATA_OFFSET, data2);
    const back2 = await sleRead(tx, SLE_DATA_OFFSET, data2.length);
    if (!back2.equals(data2)) {
      throw new Error("the card read back differently from what was written");
    }
    return fitted2;
  }
  await acosSelectFile(tx, ACOS_USER_FILE);
  await acosSubmitCode(tx, ACOS_ISSUER_CODE_REF, Buffer.from(secret, "utf8"));
  const reclen = await acosRecordLen(tx);
  const capacity = await acosRecordCount(tx, reclen) * reclen;
  const fitted = fitPayloads(payloads, capacity);
  const data = encodePayloads(fitted);
  if (data.length > capacity) {
    throw new Error(
      `this card's data file holds ${capacity} bytes and the link needs ${data.length}`
    );
  }
  await acosWriteRecords(tx, 0, reclen, data);
  await acosClearRecordsFrom(tx, Math.ceil(data.length / reclen), reclen);
  const back = await acosReadRecords(tx, 0, reclen, data.length);
  if (!back.equals(data)) {
    throw new Error("the card read back differently from what was written");
  }
  return fitted;
}
function parseHex(s) {
  const t = s.trim();
  if (!t || t.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(t)) return null;
  return Buffer.from(t, "hex");
}
export {
  ACOS_ISSUER_CODE_REF,
  ACOS_USER_FILE,
  SLE5528_SIZE,
  SLE_DATA_OFFSET,
  SLE_WRITE_SPAN,
  acosClearRecordsFrom,
  acosReadRecords,
  acosRecordCount,
  acosRecordLen,
  acosSelectFile,
  acosSubmitCode,
  acosWriteRecords,
  cardKindFromAtr,
  cardLabel,
  cardSecret,
  decodePayloads,
  encodePayloads,
  fitPayloads,
  parseHex,
  readCard,
  sleErrorCounter,
  slePresentPsc,
  sleRead,
  sleSelectType,
  sleWrite,
  writeCard
};
