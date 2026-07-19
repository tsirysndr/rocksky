import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import {
  crossfadeDurationAtom,
  crossfadeEnabledAtom,
  eqBandsAtom,
  eqEnabledAtom,
} from "../atoms/equalizer";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom, type QueueTrack } from "../atoms/queue";
import {
  effectiveQueueIndex,
  getRockboxPlayer,
  publishCrossfade,
  publishEq,
  trackForUrl,
  uploadIdFromUrl,
} from "../lib/audio/rockbox-engine";

// useRockboxEngine — bridge between the in-browser rockbox-wasm engine and the
// app's jotai atoms. Mount once (in MiniPlayer). Replaces the old <audio>
// element event wiring + custom DSP worklet.

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

  // EQ + crossfade settings → engine (live + remembered for late init).
  const eqEnabled = useAtomValue(eqEnabledAtom);
  const eqBands = useAtomValue(eqBandsAtom);
  const crossfadeEnabled = useAtomValue(crossfadeEnabledAtom);
  const crossfadeDuration = useAtomValue(crossfadeDurationAtom);

  useEffect(() => {
    publishEq(eqEnabled, eqBands);
  }, [eqEnabled, eqBands]);

  useEffect(() => {
    publishCrossfade(crossfadeEnabled, crossfadeDuration);
  }, [crossfadeEnabled, crossfadeDuration]);

  useEffect(() => {
    if (player !== "upload") return;
    const p = getRockboxPlayer();

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
    // would null the optimistic now-playing AND flip player away — which
    // detaches these very listeners, so audio keeps playing while the
    // mini-player vanishes for good. The player stays visible while playing.
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

    const onQueue = (e: { urls: string[]; index: number }) => {
      setQueue(e.urls.map(urlToQueueTrack));
      setQueueIndex(effectiveQueueIndex(e.index));
    };

    p.on("track", onTrack);
    p.on("progress", onProgress);
    p.on("status", onStatus);
    p.on("queue", onQueue);

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
