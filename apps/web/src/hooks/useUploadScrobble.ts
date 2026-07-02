import dayjs from "dayjs";
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

  // Reset the "started at" clock every time the playing track changes so each
  // scrobble is stamped with the actual play time.
  //
  // We can't key on sha256 alone: pollRockbox in StickyPlayerWithData writes
  // sha256: "" on every poll (rockbox GraphQL doesn't expose a sha256), and
  // `"" !== ""` is always false — so the effect would only fire once (on the
  // first non-null → "" transition) and every subsequent track would inherit
  // the same startedAt. Result: all scrobbles landed with the same timestamp.
  //
  // Mirror the dedup key from the submit effect below (sha256 || title::artist)
  // so an empty sha256 falls through to a value that actually changes per
  // track.
  const currentTrackKey = nowPlaying
    ? nowPlaying.sha256 || `${nowPlaying.title}::${nowPlaying.artist}`
    : null;
  const prevTrackKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentTrackKey !== prevTrackKeyRef.current) {
      prevTrackKeyRef.current = currentTrackKey;
      startedAtRef.current = Date.now();
      // Don't reset scrobbledRef here — it tracks what was already submitted
    }
  }, [currentTrackKey]);

  useEffect(() => {
    if (player !== "rockbox" || !nowPlaying) return;

    const { sha256, title, artist, albumArt, duration, progress } = nowPlaying;
    const album = queue[queueIndex]?.album;
    const albumArtist = queue[queueIndex]?.albumArtist ?? artist;

    // Use sha256 when available, otherwise fall back to title+artist for dedup
    const dedupeKey = sha256 || `${title}::${artist}`;
    if (scrobbledRef.current === dedupeKey) return;

    const threshold = Math.min(duration * 0.5, SCROBBLE_MIN_MS);
    if (progress < threshold) return;

    scrobbledRef.current = dedupeKey;

    submitScrobble({
      title,
      artist,
      albumArtist,
      album,
      albumArt,
      duration,
      timestamp: Math.floor(startedAtRef.current / 1000),
      trackNumber: queue[queueIndex]?.trackNumber ?? undefined,
      copyrightMessage: queue[queueIndex]?.copyrightMessage ?? undefined,
      genres: queue[queueIndex]?.genre ? [queue[queueIndex].genre!] : undefined,
      releaseDate: queue[queueIndex]?.releaseDate
        ? dayjs(queue[queueIndex].releaseDate).format("YYYY-MM-DD")
        : undefined,
      year: queue[queueIndex]?.year ?? undefined,
    }).catch((err) => {
      consola.warn("[scrobble] failed to submit scrobble", err);
      // Allow retry on next render by resetting the flag
      scrobbledRef.current = null; // allow retry
    });
  }, [player, nowPlaying, queue, queueIndex]);
}
