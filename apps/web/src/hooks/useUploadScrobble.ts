import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { submitScrobble } from "../api/scrobbles";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom } from "../atoms/queue";
import { consola } from "consola";

// Submit scrobble when the user has listened to at least 50% of the track
// or 4 minutes, whichever comes first — mirrors the Last.fm scrobble spec.
const SCROBBLE_MIN_MS = 4 * 60 * 1000; // 4 minutes cap

export function useUploadScrobble() {
  const player = useAtomValue(playerAtom);
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const queue = useAtomValue(queueAtom);
  const queueIndex = useAtomValue(queueIndexAtom);

  // sha256 of the last track for which we submitted a scrobble
  const scrobbledRef = useRef<string | null>(null);
  // timestamp when playback of the current track started (for the scrobble timestamp)
  const startedAtRef = useRef<number>(Date.now());

  // Reset when the track changes
  const currentSha256 = nowPlaying?.sha256 ?? null;
  const prevSha256Ref = useRef<string | null>(null);
  useEffect(() => {
    if (currentSha256 !== prevSha256Ref.current) {
      prevSha256Ref.current = currentSha256;
      startedAtRef.current = Date.now();
      // Don't reset scrobbledRef here — it tracks what was already submitted
    }
  }, [currentSha256]);

  useEffect(() => {
    if (player !== "upload" || !nowPlaying) return;

    const { sha256, title, artist, albumArt, duration, progress } = nowPlaying;
    const album = queue[queueIndex]?.album;
    const albumArtist = queue[queueIndex]?.albumArtist ?? artist;

    // Already scrobbled this track
    if (scrobbledRef.current === sha256) return;

    const threshold = Math.min(duration * 0.5, SCROBBLE_MIN_MS);
    if (progress < threshold) return;

    scrobbledRef.current = sha256;

    submitScrobble({
      title,
      artist,
      albumArtist,
      album,
      albumArt,
      duration,
      timestamp: startedAtRef.current,
    }).catch((err) => {
      consola.warn("[scrobble] failed to submit scrobble", err);
      // Allow retry on next render by resetting the flag
      scrobbledRef.current = null;
    });
  }, [player, nowPlaying, queue, queueIndex]);
}
