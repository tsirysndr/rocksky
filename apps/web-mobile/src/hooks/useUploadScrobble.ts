import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { submitScrobble } from "../api/scrobbles";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom } from "../atoms/queue";
import { consola } from "consola";

const SCROBBLE_MIN_MS = 4 * 60 * 1000;

export function useUploadScrobble() {
  const player = useAtomValue(playerAtom);
  const nowPlaying = useAtomValue(nowPlayingAtom);
  const queue = useAtomValue(queueAtom);
  const queueIndex = useAtomValue(queueIndexAtom);

  const scrobbledRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const prevSha256Ref = useRef<string | null>(null);

  const currentSha256 = nowPlaying?.sha256 ?? null;
  useEffect(() => {
    if (currentSha256 !== prevSha256Ref.current) {
      prevSha256Ref.current = currentSha256;
      startedAtRef.current = Date.now();
    }
  }, [currentSha256]);

  useEffect(() => {
    if (player !== "upload" || !nowPlaying) return;

    const { sha256, title, artist, albumArt, duration, progress } = nowPlaying;
    const album = queue[queueIndex]?.album;
    const albumArtist = queue[queueIndex]?.albumArtist ?? artist;

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
      consola.warn("[scrobble] failed to submit", err);
      scrobbledRef.current = null;
    });
  }, [player, nowPlaying, queue, queueIndex]);
}
