import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { profileAtom } from "../atoms/profile";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom, type QueueTrack } from "../atoms/queue";
import { getCurrentPlaylist } from "../lib/rockbox-graphql";

// useQueueSync — read-only mirror of rockbox's current playlist into the
// web app's queue atoms.
//
// Why poll rather than subscribe? Rockbox's GraphQL doesn't expose a
// subscription for playlist changes, and a server-sent-event channel would
// have to traverse the CF Worker → Fly router → machine path which doesn't
// guarantee SSE flushing. Polling every 3s while a rockbox track is active
// is cheap (~30 bytes uncompressed JSON over a warm HTTP/2 stream) and good
// enough for "I just queued a track on my phone, the laptop UI updated".
//
// v1 is one-way: rockbox is the source of truth. Web actions that change the
// queue (insertTracks etc.) call the rockbox mutations directly; the next
// poll picks up the change.

const POLL_INTERVAL_MS = 3000;

function toQueueTrack(t: {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  path: string;
  length: number;
}): QueueTrack {
  return {
    uploadId: t.id,
    title: t.title,
    artist: t.artist,
    albumArtist: t.artist,
    album: t.album,
    albumArt: t.albumArt,
    duration: t.length,
    sha256: "",
    songUri: "",
    streamUrl: t.path,
  };
}

export function useQueueSync() {
  const profile = useAtomValue(profileAtom);
  const player = useAtomValue(playerAtom);
  const setQueue = useSetAtom(queueAtom);
  const setIndex = useSetAtom(queueIndexAtom);
  const did = profile?.did ?? "";

  useEffect(() => {
    // Only sync while the rockbox player is active. Spotify or no-player =
    // local queue atom is the source of truth.
    if (!did || player !== "rockbox") return;

    let cancelled = false;

    const poll = async () => {
      try {
        const pl = await getCurrentPlaylist(did);
        if (cancelled || !pl) return;
        setQueue(pl.tracks.map(toQueueTrack));
        setIndex(pl.index);
      } catch (err) {
        // Container may be cold or transient network issue — the next tick
        // will retry. Don't spam the console.
        if (process.env.NODE_ENV === "development") {
          console.debug("[useQueueSync] poll failed:", err);
        }
      }
    };

    // Fetch once immediately, then on interval.
    void poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [did, player, setQueue, setIndex]);
}
