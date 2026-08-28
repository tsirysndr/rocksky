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
import {
  coverArtUrlOf,
  fetchNavidromeAlbum,
  fetchNavidromePlaylist,
  type NavidromeCredentials,
} from "../../api/navidrome";
import type { QueueTrack } from "../../atoms/queue";
import { songToQueueTrack, useNavidromeCredentials } from "../../hooks/useNavidrome";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import { useNfcStatus } from "../../hooks/useNfc";
import { type NfcTarget, onNfcScan, parseNfcPayload } from "../../lib/nfc";

// baseui's startEnhancer wants a component taking a required numeric `size`;
// the tabler icons' own `size` is wider than that.
const NfcGlyph = ({ size }: { size: number }) => <IconNfc size={size} />;
const NfcOffGlyph = ({ size }: { size: number }) => <IconNfcOff size={size} />;

type Resolved = {
  tracks: QueueTrack[];
  name: string;
  /** Where to send the user so they can see what started playing. */
  route: { to: string; params: { id: string } };
};

async function resolve(
  target: NfcTarget,
  creds: NavidromeCredentials,
): Promise<Resolved | null> {
  if (target.kind === "album") {
    const album = await fetchNavidromeAlbum(creds, target.id);
    if (!album) return null;
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

  // The handlers are re-created on every credential/queue change; keeping them
  // in a ref means the Tauri listener is registered once instead of being torn
  // down and re-registered underneath a tap.
  const handlers = useRef({ creds, playNow, navigate, enqueue });
  handlers.current = { creds, playNow, navigate, enqueue };

  useEffect(
    () =>
      onNfcScan(async ({ payload }) => {
        const { creds, playNow, navigate, enqueue } = handlers.current;
        const notify = (message: string) =>
          enqueue({ message, startEnhancer: NfcGlyph }, DURATION.short);

        const target = parseNfcPayload(payload);
        if (!target) {
          notify("This tag isn’t a Rocksky album or playlist");
          return;
        }
        if (!creds) {
          notify("Sign in to play tags from your library");
          return;
        }

        try {
          const found = await resolve(target, creds);
          if (!found) {
            notify("That tag points at something no longer in your library");
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
          notify("Could not reach your library to play that tag");
        }
      }),
    [],
  );

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
