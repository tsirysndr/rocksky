import { useAtomValue, useSetAtom } from "jotai";
import { setQueueMetaResolver } from "../lib/tauri-rockbox";
import { useEffect, useRef } from "react";
import { reconcileProgress } from "../lib/audio/progress";
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

// The native engine only sees URLs and can't read tags off an HTTP stream, so
// without this a streamed entry reaches remote controllers titled
// "stream?token=…". Hand it the registry we already keep.
setQueueMetaResolver((url: string) => {
  const t = trackForUrl(url);
  if (!t) return undefined;
  return {
    uploadId: t.uploadId,
    title: t.title,
    artist: t.artist,
    album: t.album,
    albumArtist: t.albumArtist,
    albumArt: t.albumArt,
    durationMs: t.duration,
    songUri: t.songUri,
    trackNumber: t.trackNumber ?? 0,
  };
});

export function useRockboxEngine() {
  const player = useAtomValue(playerAtom);
  // The (index, url) the last `track` event was for. The native shim emits
  // `track` a SECOND time for the same song, once the decoder fills in real
  // tags a moment after playback starts (see titleReEmitted in
  // lib/tauri-rockbox) — that is a metadata refresh, not a new track. Zeroing
  // progress on it threw the bar back to 0:00 mid-song, and the next poll
  // snapped it forward again. rockbox-wasm has no such re-emit, which is why
  // only the desktop app showed this.
  const lastTrackKey = useRef<string | null>(null);
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
      metadata: {
        title?: string;
        artist?: string;
        album?: string;
        duration_ms?: number;
        codec?: string;
        sample_rate?: number;
      } | null;
    }) => {
      const known = trackForUrl(e.url);
      const md = e.metadata;
      const key = `${e.index}\u0001${e.url}`;
      const isNewTrack = key !== lastTrackKey.current;
      lastTrackKey.current = key;
      setNowPlaying((prev) => ({
        title: known?.title ?? md?.title ?? e.url.split("/").pop() ?? "",
        artist: known?.artist ?? md?.artist ?? "",
        artistUri: "",
        songUri: known?.songUri ?? "",
        albumUri: "",
        album: known?.album ?? md?.album ?? undefined,
        duration: known?.duration ?? md?.duration_ms ?? prev?.duration ?? 0,
        progress: isNewTrack ? 0 : (prev?.progress ?? 0),
        albumArt: known?.albumArt ?? prev?.albumArt ?? undefined,
        isPlaying: true,
        sha256: known?.sha256 ?? "",
        liked: prev?.liked ?? false,
        // The engine probes the real stream, so these are authoritative for
        // uploaded audio (codec name + sample rate in Hz).
        codec: md?.codec ?? undefined,
        sampleRate: md?.sample_rate ?? undefined,
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
              // The UI ticks at 100ms between these 500ms reports, so treat the
              // engine as the authority to converge on rather than a value to
              // snap to — see reconcileProgress.
              progress: reconcileProgress(prev.progress, e.elapsed_ms),
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
      // Same guard as onStatus: a stopped engine reports index -1 — keep the
      // last known index (e.g. the restored resume position) instead of
      // regressing, which also protected the persisted resume snapshot.
      if (e.index >= 0) setQueueIndex(effectiveQueueIndex(e.index));
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
