import { useAtom, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { getQueueState, saveQueueState } from "../api/uploads";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom } from "../atoms/queue";

/**
 * Restores the upload player queue from the server on mount, and persists it
 * (debounced) whenever the queue or current index changes.
 *
 * Should be mounted once at the top of the app (StickyPlayerWithData).
 */
export function useQueuePersistence() {
  const [queue, setQueue] = useAtom(queueAtom);
  const [queueIndex, setQueueIndex] = useAtom(queueIndexAtom);
  const setPlayer = useSetAtom(playerAtom);
  const setNowPlaying = useSetAtom(nowPlayingAtom);

  // True once restoration has finished (success or failure).
  const restoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Restore on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { restoredRef.current = true; return; }

    getQueueState()
      .then((state) => {
        if (!state.queue.length) return;
        setQueue(state.queue.map((t) => ({ ...t, albumArtist: t.albumArtist ?? t.artist })));
        setQueueIndex(state.currentIndex);
        setPlayer("upload");
        const track = state.queue[state.currentIndex] ?? state.queue[0];
        setNowPlaying({
          title: track.title,
          artist: track.artist,
          artistUri: "",
          songUri: "",
          albumUri: "",
          duration: track.duration,
          progress: 0,
          albumArt: track.albumArt ?? undefined,
          isPlaying: false,
          sha256: track.sha256,
          liked: false,
        });
      })
      .catch(() => {})
      .finally(() => { restoredRef.current = true; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced save on changes ─────────────────────────────────────────────
  useEffect(() => {
    if (!restoredRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveQueueState(queue.map((t) => t.uploadId), queueIndex).catch(() => {});
    }, 1500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [queue, queueIndex]);
}
