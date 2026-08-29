// NFC tags as physical shortcuts to a library album, playlist or favorites.
//
// A tag holds one NDEF URI record. What we write is a `rocksky://` link, which
// resolves to an exact Navidrome id and therefore always plays. `at://` record
// URIs are accepted on read too, so a tag written by another Rocksky client
// still works here — a mirrored playlist carries its record URI, and that is
// matched back to the library playlist it mirrors.
//
// The whole surface no-ops outside the Tauri shell (see ../lib/tauri).

import { invoke } from "@tauri-apps/api/core";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";
import { isTauri } from "./tauri";

/** A contact card (SLE/ACOS) in a reader. Contactless tags leave this null:
 *  they need no secret, so there is nothing to ask for. */
export type ContactCard = {
  /** Human-readable, e.g. "SLE5528 memory card". */
  label: string;
  /** What its secret is called — "PSC" or "PIN". */
  secretLabel: string;
  /** The factory default, offered as the prefilled value. */
  defaultSecret: string;
};

export type NfcStatus = {
  available: boolean;
  readers: string[];
  cardPresent: boolean;
  error: string | null;
  card: ContactCard | null;
};

export const NO_READER: NfcStatus = {
  available: false,
  readers: [],
  cardPresent: false,
  error: null,
  card: null,
};

export type NfcTarget =
  | { kind: "albumUri"; uri: string }
  | { kind: "playlistUri"; uri: string }
  | { kind: "album"; id: string }
  | { kind: "playlist"; id: string }
  | { kind: "favorites"; did: string };

/**
 * What gets burned onto the tag, one NDEF record per entry, in order.
 *
 * The record's AT-URI first whenever there is one: it names the album or
 * playlist itself, so the tag is portable — it resolves on any machine, for any
 * user, against any server. The `rocksky://library/...` link to this server's
 * own id follows as a fallback, tried only when the record URI resolves to
 * nothing (never published, or the record was deleted while the upload stayed).
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

/**
 * What gets burned onto a favorites tag.
 *
 * Favorites are a query, not a record: there is no AT-URI to write and no
 * library id either, so the tag names the person instead — their DID plus the
 * label for what to play. That is enough to be portable in the way that
 * matters: any Rocksky player signed in as them resolves it, because the
 * favorites it names are theirs and not a particular server's row.
 */
export function nfcFavoritesPayloads(did: string): string[] {
  const value = did.trim();
  return value ? [`rocksky://favorites/${encodeURIComponent(value)}`] : [];
}

/** Whether a tag made from this ref will work outside the owner's library. */
export const isPortableRef = (ref: { uri?: string | null }): boolean =>
  !!ref.uri?.trim();

const AT_URI = /^at:\/\/[^/]+\/app\.rocksky\.(album|playlist)\/[^/]+$/i;

/**
 * Read a tag payload back into something playable. Returns null for a tag that
 * holds anything else — a URL, a foreign app's record, an empty tag.
 */
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

  // Favorites name their owner rather than a record — see nfcFavoritesPayloads.
  const favorites = /^rocksky:\/\/favorites\/(.+)$/i.exec(value);
  if (favorites) {
    return { kind: "favorites", did: decodeURIComponent(favorites[1]) };
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

export function nfcStatus(): Promise<NfcStatus> {
  if (!isTauri()) return Promise.resolve(NO_READER);
  return invoke<NfcStatus>("nfc_status");
}

/**
 * Arms a write and resolves with the tag's UID once the user taps one. Each
 * entry becomes one NDEF record, in order; a tag with no room for them all
 * keeps the leading ones.
 */
export function nfcWrite(payloads: string[], secret?: string): Promise<string> {
  if (!isTauri()) return Promise.reject(new Error("NFC needs the desktop app"));
  return invoke<string>("nfc_write", { payloads, secret: secret ?? null });
}

/**
 * Ask the reader to read the tag on it again, even if it never left.
 *
 * Tags are read once on arrival, and `nfc://scan` is fire-and-forget — so a tag
 * already resting on the reader when the app starts is read before this webview
 * subscribes, and would otherwise never be seen. Call this after subscribing.
 */
export function nfcRescan(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return invoke<void>("nfc_rescan").catch(() => {
    // No reader thread — nothing to re-read.
  });
}

export function nfcCancelWrite(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return invoke<void>("nfc_cancel_write").catch(() => {
    // The reader thread is gone, so there is no armed write left to cancel.
  });
}

/** A tag was tapped. */
export type NfcScan = {
  /** The tag's records, in the order a reader should try them. */
  payloads: string[];
  uid: string;
};

function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  if (!isTauri()) {
    return () => {
      // Nothing was subscribed outside the desktop shell.
    };
  }
  let unlisten: UnlistenFn | null = null;
  let cancelled = false;
  listen<T>(event, (e) => handler(e.payload))
    .then((un) => {
      // Unmounted before the listener registered — drop it immediately.
      if (cancelled) un();
      else unlisten = un;
    })
    .catch(() => {
      // No event bridge (the window is tearing down) — nothing to unsubscribe.
    });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

export const onNfcScan = (handler: (scan: NfcScan) => void) =>
  subscribe<NfcScan>("nfc://scan", handler);

export const onNfcStatus = (handler: (status: NfcStatus) => void) =>
  subscribe<NfcStatus>("nfc://status", handler);
