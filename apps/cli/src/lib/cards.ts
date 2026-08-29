// Contact smart cards: SLE memory cards and ACOS processor cards.
//
// The same records an NFC tag carries — an album or playlist's AT-URI, with the
// library id behind it as a fallback — over protocols that have nothing to do
// with NDEF. Ported from desktop/src-tauri/src/cards, which is itself ported
// from card-inspect, and the on-card bytes are identical across all three.
//
// Why not nfc-pcsc, which the contactless side uses: it connects with
// SCARD_PROTOCOL_T0|T1 and does not expose the protocol argument (see its
// Reader.js, where the line is commented out). A synchronous memory card like
// the SLE5528 only answers over SCARD_PROTOCOL_RAW, so it is unreachable
// through that library. @pokusew/pcsclite — which nfc-pcsc is built on — does
// take an explicit protocol, so the card path talks to it directly.

import {
  FAVORITES_PREFIX,
  decodeAtUri,
  decodeFavorites,
  encodeAtUri,
  encodeFavorites,
  isEncoded,
  isFavorites,
  looksLikeAtUri,
} from "./aturi";

export type CardKind = "sle5528" | "acos3";

const SLE5528_ATR = Buffer.from([0x3b, 0x04, 0x92, 0x23, 0x10, 0x91]);
const ACOS3_ATR = Buffer.from([
  0x3b, 0xbe, 0x11, 0x00, 0x00, 0x41, 0x01, 0x38, 0x00, 0x00, 0x04, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x01, 0x90, 0x00,
]);

export const SLE5528_SIZE = 1024;
/** Writes start past the protected header, matching card-inspect's default. */
export const SLE_DATA_OFFSET = 32;
/**
 * How much of an SLE card a write owns. The payload is padded to this with the
 * erased value, so nothing left by a longer previous write survives past the
 * end of a shorter new one — stale bytes read back as an extra record.
 */
export const SLE_WRITE_SPAN = 256;
export const ACOS_USER_FILE = Buffer.from([0xff, 0x04]);
export const ACOS_ISSUER_CODE_REF = 0x07;

export function cardKindFromAtr(atr: Buffer): CardKind | null {
  if (atr.equals(SLE5528_ATR)) return "sle5528";
  if (atr.equals(ACOS3_ATR)) return "acos3";
  return null;
}

/** What the card's secret is called, and the factory default to offer. */
export function cardSecret(kind: CardKind): { label: string; fallback: string } {
  return kind === "sle5528"
    ? { label: "PSC", fallback: "FFFF" }
    : { label: "PIN", fallback: "ACOSTEST" };
}

export const cardLabel = (kind: CardKind) =>
  kind === "sle5528" ? "SLE5528 memory card" : "ACOS3 card";

/** Sends an APDU and resolves with the raw response, status word included. */
export type Transmit = (apdu: Buffer) => Promise<Buffer>;

const sw = (r: Buffer): [number, number] =>
  r.length >= 2 ? [r[r.length - 2], r[r.length - 1]] : [0, 0];

const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();

/** The data of a `90 00` response, or an error naming the status word. */
function expectOk(r: Buffer): Buffer {
  if (r.length < 2) throw new Error("response too short");
  const [a, b] = sw(r);
  if (a !== 0x90 || b !== 0x00) {
    throw new Error(`card returned SW ${hex(a)} ${hex(b)}`);
  }
  return r.subarray(0, r.length - 2);
}

// ── Payloads ────────────────────────────────────────────────────────────────

/**
 * What goes on the card: the record URI compactly encoded, then the rest as
 * newline-separated text.
 *
 * The compact form is the point on ACOS, whose user file is a few tens of bytes
 * — a real one is 4 records of 7, so 28 — against 71 characters of URI as text.
 */
export function encodePayloads(payloads: string[]): Buffer {
  const [first, ...rest] = payloads;
  if (!first) throw new Error("nothing to write");
  const head = looksLikeAtUri(first)
    ? encodeAtUri(first)
    : first.startsWith(FAVORITES_PREFIX)
      ? // The webview percent-encodes the DID into the URL; the packing wants
        // the identifier itself.
        encodeFavorites(decodeURIComponent(first.slice(FAVORITES_PREFIX.length)))
      : Buffer.from(first, "utf8");
  const parts = [head];
  for (const extra of rest) {
    parts.push(Buffer.from(`\n${extra}`, "utf8"));
  }
  return Buffer.concat(parts);
}

/**
 * Trim `payloads` to what `capacity` holds, keeping at least the first.
 * Trailing records are droppable exactly as they are on a tag: the record URI
 * is what plays, the fallback only matters if it stops resolving.
 */
export function fitPayloads(payloads: string[], capacity: number): string[] {
  let take = payloads.length;
  while (take > 1) {
    try {
      if (encodePayloads(payloads.slice(0, take)).length <= capacity) break;
    } catch {
      // Unencodable at this length — try one fewer.
    }
    take -= 1;
  }
  return payloads.slice(0, take);
}

/**
 * Recover the payload list written by {@link encodePayloads}.
 *
 * Erased memory reads back as 0xFF (SLE) or 0x00 (ACOS), and a card is rarely
 * written from byte zero, so fill is skipped at *both* ends. The compact blob is
 * located before any tail trimming, because it knows its own length and its last
 * byte may legitimately be 0x00 — a packed TID ending in a zero would otherwise
 * be trimmed away and the whole URI lost.
 */
export function decodePayloads(data: Buffer): string[] {
  const fill = (b: number) => b === 0xff || b === 0x00;
  let start = 0;
  while (start < data.length && fill(data[start])) start += 1;
  data = data.subarray(start);
  if (data.length === 0) return [];

  const out: string[] = [];
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
      // Ours, but not reconstructable — better nothing than guesswork.
      return [];
    }
  }

  // Only now is trimming the tail safe: the blob has already been consumed.
  let end = rest.length;
  while (end > 0 && fill(rest[end - 1])) end -= 1;
  for (const line of rest.subarray(0, end).toString("utf8").split("\n")) {
    const trimmed = line.replace(/^[\s\0]+|[\s\0]+$/g, "");
    if (trimmed) out.push(trimmed);
  }
  return out;
}

// ── SLE5528 ─────────────────────────────────────────────────────────────────

/** Tell the reader the inserted card is an SLE4418/4428/5518/5528 (type 05). */
export async function sleSelectType(tx: Transmit): Promise<void> {
  expectOk(await tx(Buffer.from([0xff, 0xa4, 0x00, 0x00, 0x01, 0x05])));
}

/** The presentation-error counter, without presenting a code. `00` is locked. */
export async function sleErrorCounter(tx: Transmit): Promise<number | null> {
  const r = expectOk(await tx(Buffer.from([0xff, 0xb1, 0x00, 0x00, 0x03])));
  return r.length ? r[0] : null;
}

export async function sleRead(
  tx: Transmit,
  offset: number,
  length: number,
): Promise<Buffer> {
  if (offset + length > SLE5528_SIZE) {
    throw new Error(
      `read ${offset}..${offset + length} is out of range (card is ${SLE5528_SIZE} bytes)`,
    );
  }
  const parts: Buffer[] = [];
  for (let addr = offset; addr < offset + length; ) {
    const chunk = Math.min(32, offset + length - addr);
    parts.push(
      expectOk(
        await tx(Buffer.from([0xff, 0xb0, (addr >> 8) & 0xff, addr & 0xff, chunk])),
      ),
    );
    addr += chunk;
  }
  return Buffer.concat(parts);
}

/**
 * Present the security code to unlock writes.
 *
 * PRESENT_CODE does not answer `90 00`. It answers `90 <EC>`, the error counter
 * *after* the attempt: a correct code restores it to `FF`, a wrong one leaves
 * fewer bits set, and `00` means the card is locked for good.
 */
export async function slePresentPsc(tx: Transmit, psc: Buffer): Promise<void> {
  const r = await tx(Buffer.concat([Buffer.from([0xff, 0x20, 0x00, 0x00, psc.length]), psc]));
  if (r.length < 2) throw new Error("PSC verification: response too short");
  const [a, ec] = sw(r);
  if (a === 0x90 && ec === 0xff) return;
  if (a === 0x90 && ec === 0x00) {
    throw new Error("that code was wrong and the card is now locked");
  }
  if (a === 0x90) {
    const left = ec.toString(2).split("1").length - 1;
    throw new Error(
      `wrong code — ${left} attempt(s) left before the card locks permanently`,
    );
  }
  throw new Error(`PSC verification failed: SW ${hex(a)} ${hex(ec)}`);
}

export async function sleWrite(
  tx: Transmit,
  offset: number,
  data: Buffer,
): Promise<void> {
  if (offset + data.length > SLE5528_SIZE) {
    throw new Error(
      `write ${offset}..${offset + data.length} is out of range (card is ${SLE5528_SIZE} bytes)`,
    );
  }
  let addr = offset;
  for (let i = 0; i < data.length; i += 16) {
    const chunk = data.subarray(i, i + 16);
    const apdu = Buffer.concat([
      Buffer.from([0xff, 0xd0, (addr >> 8) & 0xff, addr & 0xff, chunk.length]),
      chunk,
    ]);
    try {
      expectOk(await tx(apdu));
    } catch (e: any) {
      throw new Error(`${e.message} at byte ${addr}`);
    }
    addr += chunk.length;
  }
}

// ── ACOS3 ───────────────────────────────────────────────────────────────────

const CLA = 0x80;

export async function acosSelectFile(tx: Transmit, fileId: Buffer): Promise<void> {
  const r = await tx(
    Buffer.concat([Buffer.from([CLA, 0xa4, 0x00, 0x00, fileId.length]), fileId]),
  );
  const [a, b] = sw(r);
  if (a === 0x90 && b === 0x00) return;
  if (a === 0x6a && b === 0x82) throw new Error("the card has no such file (6A 82)");
  throw new Error(`SELECT FILE failed: SW ${hex(a)} ${hex(b)}`);
}

/**
 * A file's record length, found by reading record 0 with a growing `Le`: ACOS
 * answers `90 00` while `Le` fits and `67 00` once it is too large.
 */
export async function acosRecordLen(tx: Transmit): Promise<number> {
  let len = 0;
  for (let le = 1; le <= 255; le++) {
    const [a, b] = sw(await tx(Buffer.from([CLA, 0xb2, 0x00, 0x00, le])));
    if (a === 0x90 && b === 0x00) len = le;
    else if (a === 0x67 && b === 0x00) break;
    else if (a === 0x6a && b === 0x83) break;
    else if (a === 0x69 && b === 0x82) {
      throw new Error("this file needs a code before it can be read");
    } else throw new Error(`READ RECORD probe failed: SW ${hex(a)} ${hex(b)}`);
  }
  if (len === 0) {
    throw new Error("could not determine the record length (file empty or protected)");
  }
  return len;
}

export async function acosRecordCount(tx: Transmit, reclen: number): Promise<number> {
  let n = 0;
  while (n <= 0xff) {
    const [a, b] = sw(await tx(Buffer.from([CLA, 0xb2, n, 0x00, reclen])));
    if (a === 0x90 && b === 0x00) n += 1;
    else if (a === 0x6a && b === 0x83) break;
    else if (a === 0x69 && b === 0x82) break;
    else throw new Error(`record-count probe: SW ${hex(a)} ${hex(b)}`);
  }
  return n;
}

export async function acosReadRecords(
  tx: Transmit,
  start: number,
  reclen: number,
  maxBytes?: number,
): Promise<Buffer> {
  const parts: Buffer[] = [];
  let total = 0;
  for (let rec = start; rec <= 0xff; rec++) {
    if (maxBytes !== undefined && total >= maxBytes) break;
    const r = await tx(Buffer.from([CLA, 0xb2, rec, 0x00, reclen]));
    const [a, b] = sw(r);
    if (a === 0x90 && b === 0x00) {
      const body = r.subarray(0, r.length - 2);
      parts.push(body);
      total += body.length;
    } else if (a === 0x6a && b === 0x83) break;
    else throw new Error(`READ RECORD ${rec} failed: SW ${hex(a)} ${hex(b)}`);
  }
  const out = Buffer.concat(parts);
  return maxBytes === undefined ? out : out.subarray(0, maxBytes);
}

export async function acosWriteRecords(
  tx: Transmit,
  start: number,
  reclen: number,
  data: Buffer,
): Promise<void> {
  for (let i = 0; i * reclen < data.length; i++) {
    const rec = Buffer.alloc(reclen);
    data.copy(rec, 0, i * reclen, Math.min((i + 1) * reclen, data.length));
    const [a, b] = sw(
      await tx(Buffer.concat([Buffer.from([CLA, 0xd2, start + i, 0x00, reclen]), rec])),
    );
    if (a === 0x90 && b === 0x00) continue;
    if (a === 0x69 && b === 0x82) {
      throw new Error(
        `record ${start + i} is protected — the code was not accepted for writing`,
      );
    }
    if (a === 0x6a && b === 0x83) {
      throw new Error(`record ${start + i} is past the end of the file`);
    }
    throw new Error(`WRITE RECORD ${start + i} failed: SW ${hex(a)} ${hex(b)}`);
  }
}

/** Zero the records from `start` on, so a write owns the whole file. */
export async function acosClearRecordsFrom(
  tx: Transmit,
  start: number,
  reclen: number,
): Promise<number> {
  const zeros = Buffer.alloc(reclen);
  let cleared = 0;
  for (let rec = start; rec <= 0xff; rec++) {
    const [a, b] = sw(
      await tx(Buffer.concat([Buffer.from([CLA, 0xd2, rec, 0x00, reclen]), zeros])),
    );
    if (a === 0x90 && b === 0x00) cleared += 1;
    else if (a === 0x6a && b === 0x83) break;
    else throw new Error(`clearing record ${rec} failed: SW ${hex(a)} ${hex(b)}`);
  }
  return cleared;
}

/** Present a code (PIN / issuer code); `codeRef` 0x07 is the Issuer Code. */
export async function acosSubmitCode(
  tx: Transmit,
  codeRef: number,
  code: Buffer,
): Promise<void> {
  const [a, b] = sw(
    await tx(Buffer.concat([Buffer.from([CLA, 0x20, codeRef, 0x00, code.length]), code])),
  );
  if (a === 0x90 && b === 0x00) return;
  if (a === 0x63) throw new Error(`wrong code — ${b & 0x0f} attempt(s) left before it blocks`);
  if (a === 0x69 && b === 0x83) throw new Error("that code is blocked (69 83)");
  throw new Error(`SUBMIT CODE failed: SW ${hex(a)} ${hex(b)}`);
}

// ── High level ──────────────────────────────────────────────────────────────

export async function readCard(tx: Transmit, kind: CardKind): Promise<string[]> {
  const data =
    kind === "sle5528"
      ? (await sleSelectType(tx), await sleRead(tx, SLE_DATA_OFFSET, SLE_WRITE_SPAN))
      : await (async () => {
          await acosSelectFile(tx, ACOS_USER_FILE);
          return acosReadRecords(tx, 0, await acosRecordLen(tx));
        })();
  return decodePayloads(data);
}

export async function writeCard(
  tx: Transmit,
  kind: CardKind,
  payloads: string[],
  secret: string,
): Promise<string[]> {
  if (kind === "sle5528") {
    const psc = parseHex(secret);
    if (!psc) throw new Error(`the PSC must be hex digits, got ${JSON.stringify(secret)}`);
    const fitted = fitPayloads(payloads, SLE_WRITE_SPAN);
    const data = Buffer.alloc(SLE_WRITE_SPAN, 0xff);
    encodePayloads(fitted).copy(data);

    await sleSelectType(tx);
    if ((await sleErrorCounter(tx)) === 0x00) {
      throw new Error("this card's security code is locked; it can't be written");
    }
    await slePresentPsc(tx, psc);
    await sleWrite(tx, SLE_DATA_OFFSET, data);

    const back = await sleRead(tx, SLE_DATA_OFFSET, data.length);
    if (!back.equals(data)) {
      throw new Error("the card read back differently from what was written");
    }
    return fitted;
  }

  await acosSelectFile(tx, ACOS_USER_FILE);
  await acosSubmitCode(tx, ACOS_ISSUER_CODE_REF, Buffer.from(secret, "utf8"));
  const reclen = await acosRecordLen(tx);
  const capacity = (await acosRecordCount(tx, reclen)) * reclen;

  const fitted = fitPayloads(payloads, capacity);
  const data = encodePayloads(fitted);
  if (data.length > capacity) {
    throw new Error(
      `this card's data file holds ${capacity} bytes and the link needs ${data.length}`,
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

/** Parse an even-length string of hex digits. */
export function parseHex(s: string): Buffer | null {
  const t = s.trim();
  if (!t || t.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(t)) return null;
  return Buffer.from(t, "hex");
}
