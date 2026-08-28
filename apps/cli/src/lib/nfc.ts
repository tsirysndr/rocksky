// NFC tags as physical shortcuts to a library album or playlist.
//
// Wire format is identical to the desktop app's (desktop/src-tauri/src/nfc.rs):
// one NDEF URI record holding `rocksky://library/album/<id>` or
// `rocksky://library/playlist/<id>`, where the id is the Navidrome/Subsonic id.
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
  | { kind: "album"; id: string }
  | { kind: "playlist"; id: string }
  | { kind: "playlistUri"; uri: string };

export function nfcPayloadFor(kind: "album" | "playlist", id: string): string {
  return `rocksky://library/${kind}/${id}`;
}

/** Read a tag payload back into something playable, or null if it isn't ours. */
export function parseNfcPayload(payload: string): NfcTarget | null {
  const value = payload.trim();

  const library = /^rocksky:\/\/library\/(album|playlist)\/(.+)$/i.exec(value);
  if (library) {
    return {
      kind: library[1].toLowerCase() as "album" | "playlist",
      id: decodeURIComponent(library[2]),
    };
  }

  // A library playlist mirrored to the user's PDS keeps its record URI, so a
  // tag carrying one can be matched back to the playlist exactly.
  if (/^at:\/\/[^/]+\/app\.rocksky\.playlist\/[^/]+$/i.test(value)) {
    return { kind: "playlistUri", uri: value };
  }

  return null;
}

// ── NDEF ────────────────────────────────────────────────────────────────────

/** One NDEF URI record wrapped in a Type 2 NDEF TLV, padded to whole pages. */
export function encodeNdefUri(uri: string): Buffer {
  let code = 0;
  let rest = uri;
  URI_PREFIXES.forEach((prefix, i) => {
    // Longest match wins, so "https://www." beats "https://".
    if (i > 0 && uri.startsWith(prefix) && prefix.length > URI_PREFIXES[code].length) {
      code = i;
      rest = uri.slice(prefix.length);
    }
  });

  const payload = Buffer.concat([Buffer.from([code]), Buffer.from(rest, "utf8")]);
  // MB|ME|SR|TNF=1 (well known), type "U".
  const record = Buffer.concat([
    Buffer.from([0xd1, 0x01, payload.length, 0x55]),
    payload,
  ]);

  const header =
    record.length < 0xff
      ? Buffer.from([0x03, record.length])
      : Buffer.from([0x03, 0xff, record.length >> 8, record.length & 0xff]);

  const tlv = Buffer.concat([header, record, Buffer.from([0xfe])]);
  const padding = (PAGE_LEN - (tlv.length % PAGE_LEN)) % PAGE_LEN;
  return Buffer.concat([tlv, Buffer.alloc(padding)]);
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
 * Decode the first well-known URI record in an NDEF message. Only short
 * records are handled — a tag we wrote is always one, and a foreign tag whose
 * link needs a 32-bit length is not something this app can play.
 */
function firstUriRecord(message: Buffer): string | null {
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
      if (i + 6 > message.length) return null;
      payloadLen = message.readUInt32BE(i + 2);
      cursor = i + 6;
    }
    if (hasId) cursor += 1 + message[cursor];

    const recType = message.subarray(cursor, cursor + typeLen);
    cursor += typeLen;
    const payload = message.subarray(cursor, cursor + payloadLen);
    if (payload.length < payloadLen) return null;

    // TNF 1 (well known) + type "U".
    if ((flags & 0x07) === 0x01 && recType.toString("ascii") === "U" && payload.length > 0) {
      return (URI_PREFIXES[payload[0]] ?? "") + payload.subarray(1).toString("utf8");
    }

    if ((flags & 0x40) !== 0) return null; // ME: last record
    i = cursor + payloadLen;
  }
  return null;
}

export function decodeNdefUri(data: Buffer): string | null {
  const message = findNdefTlv(data);
  return message ? firstUriRecord(message) : null;
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
  /** The URI stored on the tag, or null when it holds no NDEF URI record. */
  payload: string | null;
  reader: string;
}

export interface NfcSession {
  /** Fires for every tag tapped on any connected reader. */
  onTag(handler: (tag: TagEvent) => void): void;
  /** Fires when a reader is plugged in or unplugged. */
  onReader(handler: (name: string, connected: boolean) => void): void;
  /**
   * Arm a write: the next tag tapped gets `payload`. Resolves with its UID.
   * Rejects on timeout so a forgotten prompt doesn't overwrite a tag hours later.
   */
  write(payload: string, timeoutMs?: number): Promise<string>;
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
  let pending: { payload: string; resolve: (uid: string) => void; reject: (e: Error) => void } | null =
    null;

  nfc.on("reader", (reader) => {
    readerHandlers.forEach((h) => h(reader.reader.name, true));

    reader.on("card", async (card: { uid?: string }) => {
      const uid = card.uid ?? "";
      if (pending) {
        const job = pending;
        pending = null;
        try {
          await reader.write(FIRST_DATA_PAGE, encodeNdefUri(job.payload), PAGE_LEN);
          job.resolve(uid);
        } catch (e: any) {
          job.reject(new Error(e?.message ?? "the tag rejected the write"));
        }
        return;
      }

      let payload: string | null = null;
      try {
        payload = decodeNdefUri(await reader.read(FIRST_DATA_PAGE, DEFAULT_CAPACITY, PAGE_LEN));
      } catch {
        // Unreadable tag (wrong type, moved off the reader mid-read).
      }
      tagHandlers.forEach((h) => h({ uid, payload, reader: reader.reader.name }));
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
    write(payload, timeoutMs = 30_000) {
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
          payload,
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
