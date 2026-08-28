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
  findAlbumId,
  getAlbum,
  getCreds,
  getPlaylist,
  getPlaylists,
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

  if (target.kind === "album") {
    const { album, entries } = await getAlbum(creds, target.id);
    if (!entries.length) throw new Error(`“${album?.name ?? "album"}” is empty`);
    await streamAndPlay(token, entries.map(entryToItem), 0);
    return album?.name ?? "album";
  }

  let id = target.kind === "playlist" ? target.id : null;
  if (target.kind === "playlistUri") {
    id = (await getPlaylists(creds)).find((p) => p.uri === target.uri)?.id ?? null;
    if (!id) throw new Error("that playlist is no longer in your library");
  }

  const { playlist, entries } = await getPlaylist(creds, id!);
  if (!entries.length) throw new Error(`“${playlist?.name ?? "playlist"}” is empty`);
  await streamAndPlay(token, entries.map(entryToItem), 0);
  return playlist?.name ?? "playlist";
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
 * Write the selected album to a tag. Albums in My Music come from the uploads
 * API, which has no Navidrome id, so the id is looked up first — the tag has to
 * carry the same identifier the desktop app writes or the two wouldn't be
 * interchangeable.
 */
export async function writeAlbumTag(
  token: string,
  name: string,
  artist: string,
): Promise<void> {
  const creds = await getCreds(token);
  if (!creds) throw new Error("no library credentials");
  const id = await findAlbumId(creds, name, artist);
  if (!id) {
    throw new Error(`couldn't pin down “${name}” in your library — nothing written`);
  }
  await writeTag(nfcPayloadFor("album", id));
}

export async function writePlaylistTag(id: string): Promise<void> {
  await writeTag(nfcPayloadFor("playlist", id));
}

async function writeTag(payload: string): Promise<void> {
  const s = await connect();
  await s.write(payload);
}
