// NFC tags as physical shortcuts to a library album or playlist.
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

export type NfcStatus = {
  available: boolean;
  readers: string[];
  cardPresent: boolean;
  error: string | null;
};

export const NO_READER: NfcStatus = {
  available: false,
  readers: [],
  cardPresent: false,
  error: null,
};

export type NfcTarget =
  | { kind: "albumUri"; uri: string }
  | { kind: "playlistUri"; uri: string }
  | { kind: "album"; id: string }
  | { kind: "playlist"; id: string };

/**
 * What gets burned onto the tag.
 *
 * The record's AT-URI whenever there is one: it names the album or playlist
 * itself, so the tag is portable — it resolves on any machine, for any user,
 * against any server. The `rocksky://library/...` form is only a fallback for
 * an entity with no published record yet (an unmirrored playlist), and such a
 * tag resolves against this user's library alone.
 */
export function nfcPayloadFor(
  kind: "album" | "playlist",
  ref: { uri?: string | null; id: string },
): string {
  return ref.uri?.trim() || `rocksky://library/${kind}/${ref.id}`;
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

  return null;
}

export function nfcStatus(): Promise<NfcStatus> {
  if (!isTauri()) return Promise.resolve(NO_READER);
  return invoke<NfcStatus>("nfc_status");
}

/** Arms a write and resolves with the tag's UID once the user taps one. */
export function nfcWrite(payload: string): Promise<string> {
  if (!isTauri()) return Promise.reject(new Error("NFC needs the desktop app"));
  return invoke<string>("nfc_write", { payload });
}

export function nfcCancelWrite(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return invoke<void>("nfc_cancel_write").catch(() => {
    // The reader thread is gone, so there is no armed write left to cancel.
  });
}

/** A tag was tapped. */
export type NfcScan = { payload: string; uid: string };

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
