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
  nfcFavoritesPayloads,
  nfcPayloadsFor,
  openNfc,
  parseNfcPayloads,
} from "../lib/nfc";
import {
  entryToItem,
  getAlbum,
  getCreds,
  getDid,
  getPlaylist,
  getStarred,
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

/**
 * Resolve one tag target to a queue and play it. Returns what started playing,
 * or null when the target isn't in this library — that is the miss the caller
 * retries against the tag's next record. An unreachable library throws instead,
 * so a network failure is never mistaken for a record that isn't there.
 */
async function play(target: NfcTarget, token: string): Promise<string | null> {
  const creds = await getCreds(token);
  if (!creds) throw new Error("no library credentials");

  // Favorites belong to a person, and the only ones this session can fetch are
  // the signed-in user's. A tag naming someone else is not a miss to fall
  // through — no later record would help — so it throws and says why.
  if (target.kind === "favorites") {
    if (target.did !== (await getDid(token))) {
      throw new Error("that tag holds someone else’s favorites");
    }
    const entries = await getStarred(creds);
    if (!entries.length) throw new Error("your favorites are empty");
    await streamAndPlay(token, entries.map(entryToItem), 0);
    return "Favorites";
  }

  // getAlbum and getPlaylist each take a record URI or a Navidrome id, so a
  // portable tag and a legacy one land on the same call — no listing, no
  // matching by title.
  if (target.kind === "album" || target.kind === "albumUri") {
    const { album, entries } = await getAlbum(
      creds,
      target.kind === "albumUri" ? target.uri : target.id,
    );
    if (!album?.id) return null;
    if (!entries.length) throw new Error(`“${album.name}” is empty`);
    await streamAndPlay(token, entries.map(entryToItem), 0);
    return album.name;
  }

  const { playlist, entries } = await getPlaylist(
    creds,
    target.kind === "playlistUri" ? target.uri : target.id,
  );
  if (!playlist?.id) return null;
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

      s.onTag(async ({ payloads }) => {
        if (!payloads.length) return notify("This tag is empty");
        const targets = parseNfcPayloads(payloads);
        if (!targets.length)
          return notify("This tag isn’t a Rocksky album, playlist or favorites tag");

        const token = getToken();
        if (!token) return notify("Sign in (A) to play tags from your library");

        notify("Reading tag…");
        try {
          // Records in tag order: the record URI, then the library id. A miss on
          // the first is the case the second exists for.
          for (const target of targets) {
            const name = await play(target, token);
            if (name) return notify(`Playing “${name}”`);
          }
          notify("That tag points at something no longer in your library");
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
  // No id fallback record here: My Music rows carry no Navidrome id, and the
  // record URI is the portable half anyway.
  await writeTag(nfcPayloadsFor("album", { uri: album.uri }));
}

/** Write a playlist to a tag: its record URI, then the library id as fallback. */
export async function writePlaylistTag(playlist: {
  uri?: string;
  id: string;
}): Promise<boolean> {
  await writeTag(nfcPayloadsFor("playlist", playlist));
  return !!playlist.uri?.trim();
}

/**
 * Write the signed-in user's favorites to a tag.
 *
 * There is no record URI and no library id to write — favorites are a query —
 * so the tag names their owner and any player signed in as them resolves it.
 */
export async function writeFavoritesTag(token: string): Promise<void> {
  await writeTag(nfcFavoritesPayloads(await getDid(token)));
}

async function writeTag(payloads: string[]): Promise<void> {
  if (!payloads.length) throw new Error("nothing to write");
  const s = await connect();
  await s.write(payloads);
}
