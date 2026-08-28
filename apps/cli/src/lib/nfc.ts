// NFC tags as physical shortcuts to a library album or playlist.
//
// Wire format is identical to the desktop app's (desktop/src-tauri/src/nfc.rs),
// which has a test pinning both encoders to the same bytes: NDEF URI records
// holding the album's or playlist's `at://` record URI first, then a
// `rocksky://library/<kind>/<id>` link to this server's own id as a fallback.
// A tag written in either app therefore plays in both.
//
// The PC/SC transport lives in `nfc-pcsc`, a native module listed as an
// OPTIONAL dependency: it needs pcsclite headers to build, and the CLI must
// install and run fine on machines that will never see a reader. Every entry
// point here therefore loads it lazily and reports a plain message when it is
// absent, rather than exploding at import time.

/** Type 2 tag user memory starts at page 4; pages 0–3 are UID/lock/CC. */
const FIRST_DATA_PAGE = 4;
const PAGE_LEN = 4;
/** NTAG213 user memory. Enough for every URI we write, and the smallest tag
 *  people actually buy — so it is what we read and size against. */
const DEFAULT_CAPACITY = 144;

/** NDEF URI abbreviations (NFC Forum URI RTD, table 6), in code order. */
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
  "urn:nfc:",
];

// ── Payload scheme ──────────────────────────────────────────────────────────

export type NfcTarget =
  | { kind: "albumUri"; uri: string }
  | { kind: "playlistUri"; uri: string }
  | { kind: "album"; id: string }
  | { kind: "playlist"; id: string };

/**
 * What gets burned onto the tag, one NDEF record per entry, in order.
 *
 * The record's AT-URI first whenever there is one: it names the album or
 * playlist itself, so the tag is portable — it resolves on any machine, for any
 * user, against any server. The `rocksky://library/...` link to this server's
 * own id follows as a fallback, for when the record URI resolves to nothing
 * (the record was never published, or was deleted while the upload stayed).
 *
 * An entity with no record yet gets the id link alone, and such a tag resolves
 * against this user's library only.
 */
export function nfcPayloadsFor(
  kind: "album" | "playlist",
  ref: { uri?: string | null; id?: string | null },
): string[] {
  const uri = ref.uri?.trim();
  const id = ref.id?.trim();
  return [uri, id && `rocksky://library/${kind}/${id}`].filter(
    (p): p is string => !!p,
  );
}

const AT_URI = /^at:\/\/[^/]+\/app\.rocksky\.(album|playlist)\/[^/]+$/i;

/** Read a tag payload back into something playable, or null if it isn't ours. */
export function parseNfcPayload(payload: string): NfcTarget | null {
  const value = payload.trim();

  // A record URI names the album or playlist itself. The Navidrome API resolves
  // one directly (getAlbum / getPlaylist / search3 all take a URI), so a tag
  // written by any Rocksky client — or by a phone's tag writer — works here.
  const record = AT_URI.exec(value);
  if (record) {
    return record[1].toLowerCase() === "album"
      ? { kind: "albumUri", uri: value }
      : { kind: "playlistUri", uri: value };
  }

  // Legacy / unmirrored form: a library id, meaningful only on the server that
  // issued it. Still read so tags written before the switch keep working.
  const library = /^rocksky:\/\/library\/(album|playlist)\/(.+)$/i.exec(value);
  if (library) {
    return {
      kind: library[1].toLowerCase() as "album" | "playlist",
      id: decodeURIComponent(library[2]),
    };
  }

  return null;
}

/**
 * Every target a tag's records name, best first. Anything unrecognised is
 * dropped rather than ending the list — a foreign record sitting alongside ours
 * shouldn't hide the one we can play.
 */
export function parseNfcPayloads(payloads: string[]): NfcTarget[] {
  return payloads
    .map(parseNfcPayload)
    .filter((t): t is NfcTarget => t !== null);
}

// ── NDEF ────────────────────────────────────────────────────────────────────

/**
 * NDEF URI records wrapped in a Type 2 NDEF TLV, padded to whole pages.
 *
 * Order carries meaning: a reader tries the records front to back, so the
 * portable record URI goes first and the library-id fallback second. A reader
 * that only looks at the first record — an older build, a phone — sees exactly
 * the single-record tag it would have seen before.
 *
 * Byte-for-byte identical to the desktop app's encoder
 * (desktop/src-tauri/src/nfc.rs), which has a test pinning both.
 */
export function encodeNdefUris(uris: string[]): Buffer {
  const records = uris.map((uri, i) => {
    let code = 0;
    let rest = uri;
    URI_PREFIXES.forEach((prefix, p) => {
      // Longest match wins, so "https://www." beats "https://".
      if (p > 0 && uri.startsWith(prefix) && prefix.length > URI_PREFIXES[code].length) {
        code = p;
        rest = uri.slice(prefix.length);
      }
    });

    const payload = Buffer.concat([Buffer.from([code]), Buffer.from(rest, "utf8")]);
    // SR|TNF=1 (well known), plus MB on the first record and ME on the last —
    // both on a lone record, which is the 0xd1 tags carried before.
    const flags = 0x11 | (i === 0 ? 0x80 : 0) | (i === uris.length - 1 ? 0x40 : 0);
    return Buffer.concat([Buffer.from([flags, 0x01, payload.length, 0x55]), payload]);
  });

  const body = Buffer.concat(records);
  const header =
    body.length < 0xff
      ? Buffer.from([0x03, body.length])
      : Buffer.from([0x03, 0xff, body.length >> 8, body.length & 0xff]);

  const tlv = Buffer.concat([header, body, Buffer.from([0xfe])]);
  const padding = (PAGE_LEN - (tlv.length % PAGE_LEN)) % PAGE_LEN;
  return Buffer.concat([tlv, Buffer.alloc(padding)]);
}

/**
 * Trims `uris` to what a tag of `capacity` bytes can hold, keeping at least the
 * first. Trailing records are droppable: the first is the one that plays and
 * the rest only matter if it stops resolving, so a small tag is better off with
 * a working shortcut than with no tag at all.
 */
export function fitNdefUris(uris: string[], capacity = DEFAULT_CAPACITY): string[] {
  let take = uris.length;
  while (take > 1 && encodeNdefUris(uris.slice(0, take)).length > capacity) take -= 1;
  return uris.slice(0, take);
}

/** Walk the TLV chain and return the NDEF message's bytes. */
function findNdefTlv(data: Buffer): Buffer | null {
  let i = 0;
  while (i < data.length) {
    const tag = data[i];
    if (tag === 0x00) {
      i += 1; // NULL padding
      continue;
    }
    if (tag === 0xfe) return null; // terminator
    if (i + 1 >= data.length) return null;

    const long = data[i + 1] === 0xff;
    const len = long ? (data[i + 2] << 8) | data[i + 3] : data[i + 1];
    const start = i + (long ? 4 : 2);
    const end = start + len;
    if (end > data.length) return null;
    if (tag === 0x03) return data.subarray(start, end);
    i = end;
  }
  return null;
}

/**
 * Decode every well-known URI record in an NDEF message, in order. Only short
 * records are handled — a tag we wrote is always one, and a foreign tag whose
 * link needs a 32-bit length is not something this app can play.
 *
 * A malformed record ends the walk and keeps whatever came before it: the first
 * record is the one that plays, so a damaged fallback must not cost the caller
 * the good record ahead of it.
 */
function uriRecords(message: Buffer): string[] {
  const uris: string[] = [];
  let i = 0;
  while (i + 3 <= message.length) {
    const flags = message[i];
    const short = (flags & 0x10) !== 0;
    const hasId = (flags & 0x08) !== 0;
    const typeLen = message[i + 1];

    let payloadLen: number;
    let cursor: number;
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

    // TNF 1 (well known) + type "U".
    if ((flags & 0x07) === 0x01 && recType.toString("ascii") === "U" && payload.length > 0) {
      uris.push((URI_PREFIXES[payload[0]] ?? "") + payload.subarray(1).toString("utf8"));
    }

    if ((flags & 0x40) !== 0) break; // ME: last record
    i = cursor + payloadLen;
  }
  return uris;
}

export function decodeNdefUris(data: Buffer): string[] {
  const message = findNdefTlv(data);
  return message ? uriRecords(message) : [];
}

// ── Reader ──────────────────────────────────────────────────────────────────

export class NfcUnavailableError extends Error {
  constructor(cause: string) {
    super(
      `NFC is unavailable: ${cause}\n` +
        "Install the optional reader support with `npm i -g nfc-pcsc`, and make " +
        "sure a PC/SC reader (ACR122U or another ACS/CCID model) is plugged in.",
    );
    this.name = "NfcUnavailableError";
  }
}

async function loadNfc(): Promise<typeof import("nfc-pcsc")> {
  try {
    return await import("nfc-pcsc");
  } catch (e: any) {
    throw new NfcUnavailableError(e?.message ?? "nfc-pcsc is not installed");
  }
}

export interface TagEvent {
  uid: string;
  /**
   * The URIs stored on the tag, in tag order — the first is what should play,
   * any after it are fallbacks. Empty when it holds no NDEF URI record.
   */
  payloads: string[];
  reader: string;
}

export interface NfcSession {
  /** Fires for every tag tapped on any connected reader. */
  onTag(handler: (tag: TagEvent) => void): void;
  /** Fires when a reader is plugged in or unplugged. */
  onReader(handler: (name: string, connected: boolean) => void): void;
  /**
   * Arm a write: the next tag tapped gets one NDEF record per entry of
   * `payloads`. Resolves with its UID. Rejects on timeout so a forgotten prompt
   * doesn't overwrite a tag hours later.
   */
  write(payloads: string[], timeoutMs?: number): Promise<string>;
  close(): void;
}

/**
 * Open the reader. The session multiplexes taps between "someone is waiting to
 * write" and "play whatever this tag points at" — one PC/SC connection, because
 * a second one would fight the first for exclusive access to the card.
 */
export async function openNfc(): Promise<NfcSession> {
  const { NFC } = await loadNfc();
  const nfc = new NFC();

  const tagHandlers: ((tag: TagEvent) => void)[] = [];
  const readerHandlers: ((name: string, connected: boolean) => void)[] = [];
  let pending: {
    payloads: string[];
    resolve: (uid: string) => void;
    reject: (e: Error) => void;
  } | null = null;

  nfc.on("reader", (reader) => {
    readerHandlers.forEach((h) => h(reader.reader.name, true));

    reader.on("card", async (card: { uid?: string }) => {
      const uid = card.uid ?? "";
      if (pending) {
        const job = pending;
        pending = null;
        try {
          const fitted = fitNdefUris(job.payloads);
          await reader.write(FIRST_DATA_PAGE, encodeNdefUris(fitted), PAGE_LEN);
          job.resolve(uid);
        } catch (e: any) {
          job.reject(new Error(e?.message ?? "the tag rejected the write"));
        }
        return;
      }

      let payloads: string[] = [];
      try {
        payloads = decodeNdefUris(await reader.read(FIRST_DATA_PAGE, DEFAULT_CAPACITY, PAGE_LEN));
      } catch {
        // Unreadable tag (wrong type, moved off the reader mid-read).
      }
      tagHandlers.forEach((h) => h({ uid, payloads, reader: reader.reader.name }));
    });

    reader.on("error", () => {
      // Transient reader errors are normal when a tag is pulled away mid-read.
    });
    reader.on("end", () => readerHandlers.forEach((h) => h(reader.reader.name, false)));
  });

  nfc.on("error", () => {
    // PC/SC service hiccup; the library reconnects on its own.
  });

  return {
    onTag: (h) => tagHandlers.push(h),
    onReader: (h) => readerHandlers.push(h),
    write(payloads, timeoutMs = 30_000) {
      pending?.reject(new Error("superseded by another write"));
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending?.resolve === wrapped) pending = null;
          reject(new Error("timed out waiting for a tag"));
        }, timeoutMs);
        const wrapped = (uid: string) => {
          clearTimeout(timer);
          resolve(uid);
        };
        pending = {
          payloads,
          resolve: wrapped,
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        };
      });
    },
    close() {
      pending?.reject(new Error("the reader was closed"));
      pending = null;
      try {
        nfc.close();
      } catch {
        // Already torn down.
      }
    },
  };
}
