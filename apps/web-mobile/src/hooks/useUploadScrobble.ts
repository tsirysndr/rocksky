import { useAtomValue } from "jotai";
import { useEffect, useRef, type RefObject } from "react";
import { submitScrobble } from "../api/scrobbles";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom } from "../atoms/queue";
import { consola } from "consola";

// Last.fm scrobble rules:
//   1. Track must be at least 30 seconds long.
//   2. Must have listened for at least 30 seconds.
//   3. Must have listened for min(50% of duration, 4 minutes).
const MIN_TRACK_MS = 30_000;
const MIN_LISTEN_MS = 30_000;
const MAX_THRESHOLD_MS = 4 * 60_000;

export function useUploadScrobble(audioRef: RefObject<HTMLAudioElement | null>) {
  const player = useAtomValue(playerAtom);
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const queue = useAtomValue(queueAtom);
  const queueIndex = useAtomValue(queueIndexAtom);

  // Always-fresh refs so event listeners never close over stale values.
  const nowPlayingRef = useRef(nowPlaying);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  nowPlayingRef.current = nowPlaying;
  queueRef.current = queue;
  queueIndexRef.current = queueIndex;

  // Per-track scrobble state.
  const scrobbledRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const listeningMsRef = useRef<number>(0);
  const playStartRef = useRef<number | null>(null);
  const trackedSha256Ref = useRef<string | null>(null);

  // Reset listening counters whenever the track changes.
  const sha256 = nowPlaying?.sha256 ?? null;
  useEffect(() => {
    if (sha256 === trackedSha256Ref.current) return;
    trackedSha256Ref.current = sha256;
    listeningMsRef.current = 0;
    playStartRef.current = null;
    startedAtRef.current = Date.now();
  }, [sha256]);

  // Wire up audio events — re-attach only when player mode changes.
  useEffect(() => {
    if (player !== "upload") return;
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => {
      playStartRef.current = Date.now();
    };

    const onPause = () => {
      if (playStartRef.current !== null) {
        listeningMsRef.current += Date.now() - playStartRef.current;
        playStartRef.current = null;
      }
    };

    const onTimeUpdate = () => {
      // Accumulate listening time on every tick.
      if (playStartRef.current !== null) {
        const now = Date.now();
        listeningMsRef.current += now - playStartRef.current;
        playStartRef.current = now;
      }

      const np = nowPlayingRef.current;
      if (!np) return;

      const { sha256: currentSha256, title, artist, albumArt, duration } = np;

      if (scrobbledRef.current === currentSha256) return;

      // Rule 1: track must be at least 30 s long.
      if (duration < MIN_TRACK_MS) return;
      // Rule 2: must have actually listened for at least 30 s.
      if (listeningMsRef.current < MIN_LISTEN_MS) return;
      // Rule 3: must have listened for min(50% of duration, 4 min).
      const threshold = Math.min(duration * 0.5, MAX_THRESHOLD_MS);
      if (listeningMsRef.current < threshold) return;

      scrobbledRef.current = currentSha256;

      const q = queueRef.current;
      const idx = queueIndexRef.current;
      const album = q[idx]?.album;
      const albumArtist = q[idx]?.albumArtist ?? artist;

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
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);

    return () => {
      // Flush any in-progress listening time before detaching.
      if (playStartRef.current !== null) {
        listeningMsRef.current += Date.now() - playStartRef.current;
        playStartRef.current = null;
      }
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [player, audioRef]);
}
