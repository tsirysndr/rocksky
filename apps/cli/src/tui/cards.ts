// Writing a contact card (SLE, ACOS) from the TUI.
//
// The tag equivalents live in ./nfc.ts. These are separate because the two
// families need different PC/SC clients — see lib/card-reader.ts — and because
// a card session must not be open while the tag watcher holds the reader: two
// clients driving one card interleave their APDUs and corrupt each other.
//
// The TUI's watcher only ever touches the contactless reader, so a contact
// session alongside it is safe; the session is still opened per write and
// closed straight after.

import { openCard } from "../lib/card-reader";
import { cardLabel, cardSecret, writeCard } from "../lib/cards";
import { nfcFavoritesPayloads, nfcPayloadsFor } from "../lib/nfc";
import { getDid } from "./navidrome";

/** What a completed card write should say. */
export type CardWritten = { label: string; records: number; dropped: number };

async function write(payloads: string[]): Promise<CardWritten> {
  if (!payloads.length) throw new Error("nothing to write");
  const session = await openCard();
  try {
    // The factory default is what an unused card still has; a card with its own
    // code is written from the command line, where --secret can be passed.
    const { fallback } = cardSecret(session.kind);
    const written = await writeCard(session.transmit, session.kind, payloads, fallback);
    return {
      label: cardLabel(session.kind),
      records: written.length,
      dropped: payloads.length - written.length,
    };
  } finally {
    session.close();
  }
}

/** Write the selected album to a card. */
export async function writeAlbumCard(album: {
  uri?: string;
  name: string;
}): Promise<CardWritten> {
  if (!album.uri) {
    throw new Error(`“${album.name}” has no published record yet — nothing written`);
  }
  return write(nfcPayloadsFor("album", { uri: album.uri }));
}

/** Write a playlist to a card: its record URI, then the library id as fallback. */
export async function writePlaylistCard(playlist: {
  uri?: string;
  id: string;
}): Promise<CardWritten> {
  return write(nfcPayloadsFor("playlist", playlist));
}

/** Write the signed-in user's favorites to a card. */
export async function writeFavoritesCard(token: string): Promise<CardWritten> {
  return write(nfcFavoritesPayloads(await getDid(token)));
}
