import {payloadsFor,favoritesPayloads,parsePayload} from "../../../output/Rocksky.Cli.Native.Nfc/index.js";
const FIRST_DATA_PAGE = 4;
const PAGE_LEN = 4;
const DEFAULT_CAPACITY = 144;
const URI_PREFIXES = [
  "",
  "http://www.",
  "https://www.",
  "http://",
  "https://",
  "tel:",
  "mailto:",
  "ftp://anonymous:anonymous@",
  "ftp://ftp.",
  "ftps://",
  "sftp://",
  "smb://",
  "nfs://",
  "ftp://",
  "dav://",
  "news:",
  "telnet://",
  "imap:",
  "rtsp://",
  "urn:",
  "pop:",
  "sip:",
  "sips:",
  "tftp:",
  "btspp://",
  "btl2cap://",
  "btgoep://",
  "tcpobex://",
  "irdaobex://",
  "file://",
  "urn:epc:id:",
  "urn:epc:tag:",
  "urn:epc:pat:",
  "urn:epc:raw:",
  "urn:epc:",
  "urn:nfc:"
];
const nfcPayloadsFor=(kind,reference)=>payloadsFor(kind)(reference);
const nfcFavoritesPayloads=favoritesPayloads;
const parseNfcPayload=parsePayload;
function parseNfcPayloads(payloads) {
  return payloads.map(parseNfcPayload).filter((t) => t !== null);
}
function encodeNdefUris(uris) {
  const records = uris.map((uri, i) => {
    let code = 0;
    let rest = uri;
    URI_PREFIXES.forEach((prefix, p) => {
      if (p > 0 && uri.startsWith(prefix) && prefix.length > URI_PREFIXES[code].length) {
        code = p;
        rest = uri.slice(prefix.length);
      }
    });
    const payload = Buffer.concat([Buffer.from([code]), Buffer.from(rest, "utf8")]);
    const flags = 17 | (i === 0 ? 128 : 0) | (i === uris.length - 1 ? 64 : 0);
    return Buffer.concat([Buffer.from([flags, 1, payload.length, 85]), payload]);
  });
  const body = Buffer.concat(records);
  const header = body.length < 255 ? Buffer.from([3, body.length]) : Buffer.from([3, 255, body.length >> 8, body.length & 255]);
  const tlv = Buffer.concat([header, body, Buffer.from([254])]);
  const padding = (PAGE_LEN - tlv.length % PAGE_LEN) % PAGE_LEN;
  return Buffer.concat([tlv, Buffer.alloc(padding)]);
}
function fitNdefUris(uris, capacity = DEFAULT_CAPACITY) {
  let take = uris.length;
  while (take > 1 && encodeNdefUris(uris.slice(0, take)).length > capacity) take -= 1;
  return uris.slice(0, take);
}
function findNdefTlv(data) {
  let i = 0;
  while (i < data.length) {
    const tag = data[i];
    if (tag === 0) {
      i += 1;
      continue;
    }
    if (tag === 254) return null;
    if (i + 1 >= data.length) return null;
    const long = data[i + 1] === 255;
    const len = long ? data[i + 2] << 8 | data[i + 3] : data[i + 1];
    const start = i + (long ? 4 : 2);
    const end = start + len;
    if (end > data.length) return null;
    if (tag === 3) return data.subarray(start, end);
    i = end;
  }
  return null;
}
function uriRecords(message) {
  const uris = [];
  let i = 0;
  while (i + 3 <= message.length) {
    const flags = message[i];
    const short = (flags & 16) !== 0;
    const hasId = (flags & 8) !== 0;
    const typeLen = message[i + 1];
    let payloadLen;
    let cursor;
    if (short) {
      payloadLen = message[i + 2];
      cursor = i + 3;
    } else {
      if (i + 6 > message.length) break;
      payloadLen = message.readUInt32BE(i + 2);
      cursor = i + 6;
    }
    if (hasId) {
      if (cursor >= message.length) break;
      cursor += 1 + message[cursor];
    }
    const recType = message.subarray(cursor, cursor + typeLen);
    if (recType.length < typeLen) break;
    cursor += typeLen;
    const payload = message.subarray(cursor, cursor + payloadLen);
    if (payload.length < payloadLen) break;
    if ((flags & 7) === 1 && recType.toString("ascii") === "U" && payload.length > 0) {
      uris.push((URI_PREFIXES[payload[0]] ?? "") + payload.subarray(1).toString("utf8"));
    }
    if ((flags & 64) !== 0) break;
    i = cursor + payloadLen;
  }
  return uris;
}
function decodeNdefUris(data) {
  const message = findNdefTlv(data);
  return message ? uriRecords(message) : [];
}
const CLASSIC_BLOCK_LEN = 16;
const CLASSIC_SECTOR_BYTES = 3 * CLASSIC_BLOCK_LEN;
const KEY_A = 96;
const KEY_B = 97;
const NDEF_KEY = Buffer.from([211, 247, 211, 247, 211, 247]);
const FACTORY_KEY = Buffer.from([255, 255, 255, 255, 255, 255]);
const MAD_KEY = Buffer.from([160, 161, 162, 163, 164, 165]);
function tagKindFromAtr(atr) {
  if (!atr) return { kind: "unknown" };
  const rid = Buffer.from([160, 0, 0, 3, 6]);
  const at = atr.indexOf(rid);
  if (at < 0 || at + rid.length + 3 > atr.length) return { kind: "unknown" };
  const name = atr.readUInt16BE(at + rid.length + 1);
  switch (name) {
    case 3:
      return { kind: "type2" };
    case 1:
      return { kind: "classic", name: "MIFARE Classic 1K", sectors: 16 };
    // Only a 4K's first 32 sectors are the 4-block kind addressed here.
    case 2:
      return { kind: "classic", name: "MIFARE Classic 4K", sectors: 32 };
    case 38:
      return { kind: "classic", name: "MIFARE Mini", sectors: 5 };
    default:
      return { kind: "unknown" };
  }
}
function trailer(keyA, access) {
  return Buffer.concat([keyA, Buffer.from(access), FACTORY_KEY]);
}
function crc8Mad(data) {
  let crc = 199;
  for (const b of data) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = crc & 128 ? (crc << 1 ^ 29) & 255 : crc << 1 & 255;
    }
  }
  return crc;
}
function madBlocks(sectors) {
  const aids = [];
  for (let s = 1; s < Math.min(sectors, 16); s++) aids.push(225, 3);
  const b1 = Buffer.concat([Buffer.from([0, 0]), Buffer.from(aids.slice(0, 14))]);
  const b2 = Buffer.concat([Buffer.from(aids.slice(14))]);
  b1[0] = crc8Mad(Buffer.concat([b1.subarray(1), b2]));
  return [b1, b2];
}
function classicDataBlocks(sectors) {
  const blocks = [];
  for (let s = 1; s < sectors; s++) for (let b = 0; b < 3; b++) blocks.push(s * 4 + b);
  return blocks;
}
async function tryAuth(reader, key, sector) {
  try {
    await reader.authenticate(sector * 4, KEY_A, key);
    return true;
  } catch {
    return false;
  }
}
async function classicFormat(reader, sectors) {
  const blank = Buffer.alloc(CLASSIC_BLOCK_LEN);
  for (let s = 1; s < sectors; s++) {
    if (!await tryAuth(reader, FACTORY_KEY, s)) {
      throw new Error(`sector ${s} wouldn't authenticate to format`);
    }
    for (let b = 0; b < 3; b++) {
      await reader.write(s * 4 + b, blank, CLASSIC_BLOCK_LEN);
    }
    await reader.write(s * 4 + 3, trailer(NDEF_KEY, [127, 7, 136, 64]), CLASSIC_BLOCK_LEN);
  }
  if (!await tryAuth(reader, FACTORY_KEY, 0)) {
    throw new Error("the MAD sector wouldn't authenticate to format");
  }
  const [b1, b2] = madBlocks(sectors);
  await reader.write(1, b1, CLASSIC_BLOCK_LEN);
  await reader.write(2, b2, CLASSIC_BLOCK_LEN);
  await reader.write(3, trailer(MAD_KEY, [120, 119, 136, 193]), CLASSIC_BLOCK_LEN);
}
async function classicReadNdef(reader, sectors) {
  const parts = [];
  for (let s = 1; s < sectors; s++) {
    if (!await tryAuth(reader, NDEF_KEY, s)) break;
    try {
      parts.push(await reader.read(s * 4, CLASSIC_SECTOR_BYTES, CLASSIC_BLOCK_LEN));
    } catch {
      break;
    }
  }
  return decodeNdefUris(Buffer.concat(parts));
}
async function classicWriteNdef(reader, bytes, sectors) {
  if (!await tryAuth(reader, NDEF_KEY, 1)) {
    if (!await tryAuth(reader, FACTORY_KEY, 1)) {
      throw new Error(
        "this MIFARE Classic tag is locked with keys we don't have, so it can't be written"
      );
    }
    await classicFormat(reader, sectors);
  }
  const padLen = (CLASSIC_BLOCK_LEN - bytes.length % CLASSIC_BLOCK_LEN) % CLASSIC_BLOCK_LEN;
  const padded = Buffer.concat([bytes, Buffer.alloc(padLen)]);
  const blocks = classicDataBlocks(sectors);
  const chunks = [];
  for (let i = 0; i < padded.length; i += CLASSIC_BLOCK_LEN) {
    chunks.push(padded.subarray(i, i + CLASSIC_BLOCK_LEN));
  }
  if (chunks.length > blocks.length) {
    throw new Error(
      `this tag holds ${blocks.length * CLASSIC_BLOCK_LEN} bytes of NDEF; the link needs ${padded.length}.`
    );
  }
  const plan = chunks.map((chunk, i) => ({ block: blocks[i], chunk }));
  if (!plan.length) throw new Error("nothing to write");
  plan.push(plan.shift());
  let authed = -1;
  for (const { block, chunk } of plan) {
    const sector = Math.floor(block / 4);
    if (authed !== sector) {
      if (!await tryAuth(reader, NDEF_KEY, sector)) {
        throw new Error(`sector ${sector} wouldn't authenticate`);
      }
      authed = sector;
    }
    await reader.write(block, chunk, CLASSIC_BLOCK_LEN);
  }
}
function tagCapacity(kind) {
  return kind.kind === "classic" ? (kind.sectors - 1) * CLASSIC_SECTOR_BYTES : DEFAULT_CAPACITY;
}
class NfcUnavailableError extends Error {
  constructor(cause) {
    super(
      `NFC is unavailable: ${cause}
Install the optional reader support with \`npm i -g nfc-pcsc\`, and make sure a PC/SC reader (ACR122U or another ACS/CCID model) is plugged in.`
    );
    this.name = "NfcUnavailableError";
  }
}
async function loadNfc() {
  try {
    return await import("nfc-pcsc");
  } catch (e) {
    throw new NfcUnavailableError(e?.message ?? "nfc-pcsc is not installed");
  }
}
async function openNfc() {
  const { NFC } = await loadNfc();
  const nfc = new NFC();
  const tagHandlers = [];
  const readerHandlers = [];
  let pending = null;
  nfc.on("reader", (reader) => {
    readerHandlers.forEach((h) => h(reader.reader.name, true));
    reader.on("card", async (card) => {
      const uid = card.uid ?? "";
      const kind = tagKindFromAtr(card.atr);
      if (pending) {
        const job = pending;
        pending = null;
        try {
          const fitted = fitNdefUris(job.payloads, tagCapacity(kind));
          const bytes = encodeNdefUris(fitted);
          if (kind.kind === "classic") {
            await classicWriteNdef(reader, bytes, kind.sectors);
          } else {
            await reader.write(FIRST_DATA_PAGE, bytes, PAGE_LEN);
          }
          job.resolve(uid);
        } catch (e) {
          job.reject(new Error(e?.message ?? "the tag rejected the write"));
        }
        return;
      }
      let payloads = [];
      try {
        payloads = kind.kind === "classic" ? await classicReadNdef(reader, kind.sectors) : decodeNdefUris(await reader.read(FIRST_DATA_PAGE, DEFAULT_CAPACITY, PAGE_LEN));
      } catch {
      }
      tagHandlers.forEach((h) => h({ uid, payloads, reader: reader.reader.name }));
    });
    reader.on("error", () => {
    });
    reader.on("end", () => readerHandlers.forEach((h) => h(reader.reader.name, false)));
  });
  nfc.on("error", () => {
  });
  return {
    onTag: (h) => tagHandlers.push(h),
    onReader: (h) => readerHandlers.push(h),
    write(payloads, timeoutMs = 3e4) {
      pending?.reject(new Error("superseded by another write"));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending?.resolve === wrapped) pending = null;
          reject(new Error("timed out waiting for a tag"));
        }, timeoutMs);
        const wrapped = (uid) => {
          clearTimeout(timer);
          resolve(uid);
        };
        pending = {
          payloads,
          resolve: wrapped,
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          }
        };
      });
    },
    close() {
      pending?.reject(new Error("the reader was closed"));
      pending = null;
      try {
        nfc.close();
      } catch {
      }
    }
  };
}
export {
  NfcUnavailableError,
  classicReadNdef,
  classicWriteNdef,
  decodeNdefUris,
  encodeNdefUris,
  fitNdefUris,
  nfcFavoritesPayloads,
  nfcPayloadsFor,
  openNfc,
  parseNfcPayload,
  parseNfcPayloads,
  tagCapacity,
  tagKindFromAtr
};
