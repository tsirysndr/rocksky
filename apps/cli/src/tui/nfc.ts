// NFC in the TUI: one reader session, shared by the tap-to-play watcher and
// the "write this album/playlist to a tag" action.
//
// A second PC/SC connection would fight the first for exclusive access to the
// card, so everything goes through this module-level session. It is opened when
// the TUI starts and closed when it exits; with no reader (or without the
// optional nfc-pcsc module) opening simply fails and the TUI carries on.

import {
  type NfcSession,
  type NfcTarget,
  nfcPayloadFor,
  openNfc,
  parseNfcPayload,
} from "../lib/nfc";
import {
  entryToItem,
  getAlbum,
  getCreds,
  getPlaylist,
} from "./navidrome";
import { streamAndPlay } from "./playback";

let session: NfcSession | null = null;
let opening: Promise<NfcSession> | null = null;

/** The shared session, opened on first use. Rejects when no reader is usable. */
function connect(): Promise<NfcSession> {
  if (session) return Promise.resolve(session);
  if (!opening) {
    opening = openNfc().then(
      (s) => {
        session = s;
        return s;
      },
      (e) => {
        // Retried on the next attempt — the user may plug a reader in later.
        opening = null;
        throw e;
      },
    );
  }
  return opening;
}

export function closeNfc(): void {
  session?.close();
  session = null;
  opening = null;
}

/** Resolve a tag payload to a queue and play it. Returns what started playing. */
async function play(target: NfcTarget, token: string): Promise<string> {
  const creds = await getCreds(token);
  if (!creds) throw new Error("no library credentials");

  // getAlbum and getPlaylist each take a record URI or a Navidrome id, so a
  // portable tag and a legacy one land on the same call — no listing, no
  // matching by title.
  if (target.kind === "album" || target.kind === "albumUri") {
    const { album, entries } = await getAlbum(
      creds,
      target.kind === "albumUri" ? target.uri : target.id,
    );
    if (!album?.id) throw new Error("that album is not in your library");
    if (!entries.length) throw new Error(`“${album.name}” is empty`);
    await streamAndPlay(token, entries.map(entryToItem), 0);
    return album.name;
  }

  const { playlist, entries } = await getPlaylist(
    creds,
    target.kind === "playlistUri" ? target.uri : target.id,
  );
  if (!playlist?.id) throw new Error("that playlist is not in your library");
  if (!entries.length) throw new Error(`“${playlist.name}” is empty`);
  await streamAndPlay(token, entries.map(entryToItem), 0);
  return playlist.name;
}

/**
 * Start listening for tags. `notify` drives the TUI's message line, so a tap
 * always says something — including when the tag holds nothing we can play.
 */
export function startNfcWatch(
  getToken: () => string | undefined,
  notify: (message: string) => void,
): () => void {
  let stopped = false;

  connect().then(
    (s) => {
      if (stopped) return closeNfc();

      s.onReader((name, connected) =>
        notify(connected ? `NFC reader connected — ${name}` : "NFC reader disconnected"),
      );

      s.onTag(async ({ payload }) => {
        if (!payload) return notify("This tag is empty");
        const target = parseNfcPayload(payload);
        if (!target) return notify("This tag isn’t a Rocksky album or playlist");

        const token = getToken();
        if (!token) return notify("Sign in (A) to play tags from your library");

        notify("Reading tag…");
        try {
          notify(`Playing “${await play(target, token)}”`);
        } catch (e: any) {
          notify(`Tag error: ${e.message}`);
        }
      });
    },
    () => {
      // No reader / no nfc-pcsc. Silent: this is the normal case for most users,
      // and `rocksky nfc status` explains it for anyone who goes looking.
    },
  );

  return () => {
    stopped = true;
  };
}

/**
 * Write the selected album to a tag.
 *
 * My Music rows come from the uploads API, which carries the album's record URI
 * — and that URI is exactly what the tag should hold, so there is nothing to
 * look up. (This used to match the album by title and artist against the
 * library, which could refuse or, worse, pin the wrong release.)
 */
export async function writeAlbumTag(album: {
  uri?: string;
  name: string;
}): Promise<void> {
  if (!album.uri) {
    throw new Error(`“${album.name}” has no published record yet — nothing written`);
  }
  await writeTag(nfcPayloadFor("album", { uri: album.uri, id: "" }));
}

/** Write a playlist to a tag, preferring its record URI over the library id. */
export async function writePlaylistTag(playlist: {
  uri?: string;
  id: string;
}): Promise<boolean> {
  await writeTag(nfcPayloadFor("playlist", playlist));
  return !!playlist.uri?.trim();
}

async function writeTag(payload: string): Promise<void> {
  const s = await connect();
  await s.write(payload);
}
