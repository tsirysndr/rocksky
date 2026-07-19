import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom, type QueueTrack } from "../atoms/queue";
import {
  effectiveQueueIndex,
  getRockboxPlayer,
  trackForUrl,
  uploadIdFromUrl,
} from "../lib/audio/rockbox-engine";

// useRockboxEngine — the bridge between the in-browser rockbox-wasm engine and
// the app's jotai atoms. Mount it once (in StickyPlayerWithData).
//
// This replaces the old GraphQL polling (pollRockbox + pollQueue): the engine
// emits `track`, `progress`, `status` and `queue` events, and we translate each
// into the same atoms the UI already reads. No network, no HLS.

/** Build a QueueTrack from a queue URL, using the metadata registry when we
 *  enqueued it ourselves, else a bare URL-only fallback. */
function urlToQueueTrack(url: string): QueueTrack {
  const known = trackForUrl(url);
  if (known) return known;
  return {
    uploadId: uploadIdFromUrl(url) ?? url,
    title: url.split("/").pop() ?? url,
    artist: "",
    albumArtist: "",
    album: "",
    albumArt: null,
    duration: 0,
    sha256: "",
    songUri: "",
    streamUrl: url,
  };
}

export function useRockboxEngine() {
  const player = useAtomValue(playerAtom);
  const setNowPlaying = useSetAtom(nowPlayingAtom);
  const setQueue = useSetAtom(queueAtom);
  const setQueueIndex = useSetAtom(queueIndexAtom);
  const setPlayer = useSetAtom(playerAtom);

  useEffect(() => {
    // Only mirror engine state while the rockbox engine owns playback. Spotify
    // (or nothing) → leave the atoms to their own source of truth.
    if (player !== "rockbox") return;
    const p = getRockboxPlayer();

    // track: a new track started — refresh full now-playing metadata.
    const onTrack = (e: {
      index: number;
      url: string;
      metadata: { title?: string; artist?: string; duration_ms?: number } | null;
    }) => {
      const known = trackForUrl(e.url);
      const md = e.metadata;
      setNowPlaying((prev) => ({
        title: known?.title ?? md?.title ?? e.url.split("/").pop() ?? "",
        artist: known?.artist ?? md?.artist ?? "",
        artistUri: "",
        songUri: known?.songUri ?? "",
        albumUri: "",
        duration: known?.duration ?? md?.duration_ms ?? prev?.duration ?? 0,
        progress: 0,
        albumArt: known?.albumArt ?? prev?.albumArt ?? undefined,
        isPlaying: true,
        sha256: known?.sha256 ?? "",
        liked: prev?.liked ?? false,
      }));
      // NB: don't set the queue index here — the `track` event reports the
      // index captured when the track started loading, which can be stale if
      // the queue was reordered (background-fill) meanwhile. onStatus / onQueue
      // carry the live index.
    };

    // progress: once-per-second elapsed/duration + play state.
    const onProgress = (e: {
      state: "stopped" | "playing" | "paused";
      elapsed_ms: number;
      duration_ms: number;
    }) => {
      setNowPlaying((prev) =>
        prev
          ? {
              ...prev,
              progress: e.elapsed_ms,
              duration: e.duration_ms || prev.duration,
              isPlaying: e.state === "playing",
            }
          : prev,
      );
    };

    // status: transport / queue-length / index. We deliberately do NOT clear
    // nowPlaying/player here. The engine emits a `stopped, queue_len: 0` status
    // while it boots (before setQueue runs); treating that as "playback ended"
    // would null the optimistic now-playing AND flip player away from rockbox —
    // which detaches these very listeners, so playback continues audibly while
    // the mini-player vanishes for good. The player stays visible while playing
    // and after the queue ends (paused on the last track).
    const onStatus = (e: {
      state: "stopped" | "playing" | "paused";
      index: number;
      queue_len: number;
    }) => {
      if (e.index >= 0) setQueueIndex(effectiveQueueIndex(e.index));
      setNowPlaying((prev) =>
        prev ? { ...prev, isPlaying: e.state === "playing" } : prev,
      );
    };

    // queue: the URL list changed — rebuild the queue atom from metadata.
    const onQueue = (e: { urls: string[]; index: number }) => {
      setQueue(e.urls.map(urlToQueueTrack));
      setQueueIndex(effectiveQueueIndex(e.index));
    };

    p.on("track", onTrack);
    p.on("progress", onProgress);
    p.on("status", onStatus);
    p.on("queue", onQueue);

    // Seed the atoms from the engine's current snapshot on (re)mount.
    if (p.queue.length) {
      setQueue(p.queue.map(urlToQueueTrack));
      setQueueIndex(p.state.index);
    }

    return () => {
      p.off("track", onTrack);
      p.off("progress", onProgress);
      p.off("status", onStatus);
      p.off("queue", onQueue);
    };
  }, [player, setNowPlaying, setQueue, setQueueIndex, setPlayer]);
}
