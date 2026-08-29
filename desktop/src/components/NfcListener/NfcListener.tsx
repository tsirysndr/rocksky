// Tap a tag, hear the record. Mounted once at the root so a tag works from
// anywhere in the app — including while the window is in the background.
//
// The reader thread only hands over the URI it found on the tag; everything
// from there (resolve → queue → play) happens here, against the same Navidrome
// helpers the library pages use, so a tap and a click end up in exactly the
// same place.

import { IconNfc, IconNfcOff } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { DURATION, useSnackbar } from "baseui/snackbar";
import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import {
  coverArtUrlOf,
  fetchNavidromeAlbum,
  fetchNavidromeFavorites,
  fetchNavidromePlaylist,
  type NavidromeCredentials,
} from "../../api/navidrome";
import { profileAtom } from "../../atoms/profile";
import type { QueueTrack } from "../../atoms/queue";
import { songToQueueTrack, useNavidromeCredentials } from "../../hooks/useNavidrome";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import { useNfcStatus } from "../../hooks/useNfc";
import { type NfcTarget, nfcRescan, onNfcScan, parseNfcPayloads } from "../../lib/nfc";

// baseui's startEnhancer wants a component taking a required numeric `size`;
// the tabler icons' own `size` is wider than that.
const NfcGlyph = ({ size }: { size: number }) => <IconNfc size={size} />;
const NfcOffGlyph = ({ size }: { size: number }) => <IconNfcOff size={size} />;

type Resolved = {
  tracks: QueueTrack[];
  name: string;
  /** Where to send the user so they can see what started playing. */
  route: { to: string; params?: { id: string }; search?: { tab: string } };
};

/**
 * The first target that is actually in the library, or null if none are.
 *
 * A tag carries the record URI and the library id behind it, so a miss on the
 * first is exactly what the second is for. Only a miss falls through: a network
 * or auth failure throws, so an outage is reported as one instead of being
 * retried against a second lookup that would fail the same way.
 */
async function resolveFirst(
  targets: NfcTarget[],
  creds: NavidromeCredentials,
): Promise<Resolved | null> {
  for (const target of targets) {
    const found = await resolve(target, creds);
    if (found) return found;
  }
  return null;
}

async function resolve(
  target: NfcTarget,
  creds: NavidromeCredentials,
): Promise<Resolved | null> {
  // A favorites tag names its owner, and the only favorites this app can fetch
  // are the signed-in user's — the caller has already checked the DID matches.
  if (target.kind === "favorites") {
    const songs = await fetchNavidromeFavorites(creds);
    return {
      tracks: songs.map((s) =>
        songToQueueTrack(s, creds, s.coverArt ? coverArtUrlOf(s) : null),
      ),
      name: "Favorites",
      route: { to: "/library", search: { tab: "favorites" } },
    };
  }

  // getAlbum takes either a record URI or a Navidrome id, so a portable tag and
  // a legacy one land on the same call.
  if (target.kind === "album" || target.kind === "albumUri") {
    const album = await fetchNavidromeAlbum(
      creds,
      target.kind === "albumUri" ? target.uri : target.id,
    );
    // A miss comes back as an error body with no album in it, which still
    // destructures into an object — so test a field, not the object.
    if (!album?.id) return null;
    const art = album.coverArt ? coverArtUrlOf(album) : null;
    return {
      tracks: (album.song ?? []).map((s) => songToQueueTrack(s, creds, art)),
      name: album.name,
      route: { to: "/library/album/$id", params: { id: album.id } },
    };
  }

  // A tag written by another Rocksky client carries the playlist's record URI.
  // getPlaylist takes either that or a Navidrome id, and mirrored playlists keep
  // their URI, so the match is exact — no title guessing and no listing.
  const playlist = await fetchNavidromePlaylist(
    creds,
    target.kind === "playlistUri" ? target.uri : target.id,
  );
  // A "not found" comes back as an error body with no playlist in it, which
  // still destructures into an object — so test a field, not the object.
  if (!playlist?.id) return null;
  return {
    tracks: (playlist.entry ?? []).map((s) =>
      songToQueueTrack(s, creds, s.coverArt ? coverArtUrlOf(s) : null),
    ),
    name: playlist.name,
    route: { to: "/library/playlist/$id", params: { id: playlist.id } },
  };
}

export default function NfcListener() {
  const navigate = useNavigate();
  const { enqueue } = useSnackbar();
  const { data: creds } = useNavidromeCredentials();
  const { playNow } = useUploadPlayer();
  const status = useNfcStatus();
  const did = useAtomValue(profileAtom)?.did;

  // The handlers are re-created on every credential/queue change; keeping them
  // in a ref means the Tauri listener is registered once instead of being torn
  // down and re-registered underneath a tap.
  const handlers = useRef({ creds, did, playNow, navigate, enqueue });
  handlers.current = { creds, did, playNow, navigate, enqueue };

  useEffect(() => {
    const stop = onNfcScan(async ({ payloads }) => {
        const { creds, did, playNow, navigate, enqueue } = handlers.current;
        const notify = (message: string) =>
          enqueue({ message, startEnhancer: NfcGlyph }, DURATION.short);

        const targets = parseNfcPayloads(payloads);
        if (!targets.length) {
          notify("This isn’t a Rocksky album, playlist or favorites tag");
          return;
        }
        if (!creds) {
          notify("Sign in to play tags and cards from your library");
          return;
        }

        // Favorites are only ever fetched for the signed-in user, so a tag made
        // by someone else names a set this app cannot reach. Saying so beats
        // resolving it into the generic "no longer in your library".
        const playable = targets.filter(
          (t) => t.kind !== "favorites" || t.did === did,
        );
        if (!playable.length) {
          notify("That holds someone else’s favorites");
          return;
        }

        try {
          const found = await resolveFirst(playable, creds);
          if (!found) {
            notify("That points at something no longer in your library");
            return;
          }
          if (found.tracks.length === 0) {
            notify(`“${found.name}” is empty`);
            return;
          }
          playNow(found.tracks);
          navigate(found.route as never);
          notify(`Playing “${found.name}”`);
        } catch {
          notify("Could not reach your library to play that");
        }
    });

    return stop;
  }, []);

  // Ask for the tag that may already be resting on the reader. Its arrival scan
  // fired before this component mounted, and since it never leaves, nothing
  // would emit again.
  //
  // Deferred until the credentials are in hand: they are fetched over the
  // network, and a scan that lands before they arrive is dropped with "sign in
  // to play tags" — which is how a tag on the reader at launch silently did
  // nothing. Once only, so later credential refetches don't restart playback.
  const rescanned = useRef(false);
  useEffect(() => {
    if (!creds || rescanned.current) return;
    rescanned.current = true;
    nfcRescan();
  }, [creds]);

  // Reader plug/unplug. Skips the first observation so launching the app with
  // a reader already attached doesn't pop a toast.
  const lastReader = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const current = status.readers[0] ?? null;
    const previous = lastReader.current;
    lastReader.current = current;
    if (previous === undefined || previous === current) return;

    if (current) {
      enqueue(
        { message: `NFC reader connected — ${current}`, startEnhancer: NfcGlyph },
        DURATION.short,
      );
    } else {
      enqueue(
        { message: "NFC reader disconnected", startEnhancer: NfcOffGlyph },
        DURATION.short,
      );
    }
  }, [status.readers, enqueue]);

  return null;
}
