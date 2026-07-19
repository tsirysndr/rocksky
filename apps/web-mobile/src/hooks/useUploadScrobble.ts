import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { submitScrobble } from "../api/scrobbles";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom } from "../atoms/queue";
import { consola } from "consola";

// Last.fm scrobble rules:
//   1. Track must be at least 30 seconds long.
//   2. Must have listened for min(50% of duration, 4 minutes).
//
// Driven by the engine's progress (nowPlaying.progress/duration in ms) rather
// than an <audio> element — the wasm engine is the playback source now.
const MIN_TRACK_MS = 30_000;
const MAX_THRESHOLD_MS = 4 * 60_000;

export function useUploadScrobble() {
  const player = useAtomValue(playerAtom);
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const queue = useAtomValue(queueAtom);
  const queueIndex = useAtomValue(queueIndexAtom);

  // sha256 (or title::artist) of the last track we submitted a scrobble for.
  const scrobbledRef = useRef<string | null>(null);
  // Wall-clock time the current track started, for the scrobble timestamp.
  const startedAtRef = useRef<number>(Date.now());

  // Reset the start clock whenever the playing track changes.
  const trackKey = nowPlaying
    ? nowPlaying.sha256 || `${nowPlaying.title}::${nowPlaying.artist}`
    : null;
  const prevTrackKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (trackKey !== prevTrackKeyRef.current) {
      prevTrackKeyRef.current = trackKey;
      startedAtRef.current = Date.now();
    }
  }, [trackKey]);

  useEffect(() => {
    if (player !== "upload" || !nowPlaying) return;
    const { sha256, title, artist, albumArt, duration, progress } = nowPlaying;

    const dedupeKey = sha256 || `${title}::${artist}`;
    if (scrobbledRef.current === dedupeKey) return;

    if (duration < MIN_TRACK_MS) return;
    const threshold = Math.min(duration * 0.5, MAX_THRESHOLD_MS);
    if (progress < threshold) return;

    scrobbledRef.current = dedupeKey;

    const album = queue[queueIndex]?.album;
    const albumArtist = queue[queueIndex]?.albumArtist ?? artist;

    submitScrobble({
      title,
      artist,
      albumArtist,
      album,
      albumArt,
      duration,
      timestamp: Math.floor(startedAtRef.current / 1000),
    }).catch((err) => {
      consola.warn("[scrobble] submit failed:", err);
      scrobbledRef.current = null; // allow retry on next tick
    });
  }, [player, nowPlaying, queue, queueIndex]);
}
