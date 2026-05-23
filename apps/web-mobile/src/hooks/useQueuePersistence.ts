import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { getQueueState, saveQueueState } from "../api/uploads";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom, type QueueTrack } from "../atoms/queue";
import { consola } from "consola";

export function useQueuePersistence() {
  const setQueue = useSetAtom(queueAtom);
  const setQueueIndex = useSetAtom(queueIndexAtom);
  const setNowPlaying = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);

  const queue = useAtomValue(queueAtom);
  const queueIndex = useAtomValue(queueIndexAtom);

  const restoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore on mount
  useEffect(() => {
    if (!localStorage.getItem("token")) { restoredRef.current = true; return; }
    getQueueState()
      .then(({ queue: persisted, currentIndex }) => {
        if (persisted.length === 0) return;
        const tracks: QueueTrack[] = persisted.map((t) => ({
          uploadId: t.uploadId,
          title: t.title,
          artist: t.artist,
          album: t.album,
          albumArt: t.albumArt,
          duration: t.duration,
          sha256: t.sha256,
        }));
        const idx = Math.min(currentIndex, tracks.length - 1);
        setQueue(tracks);
        setQueueIndex(idx);
        const track = tracks[idx];
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
        setPlayer("upload");
      })
      .catch((e) => consola.warn("[queue-persistence] restore failed", e))
      .finally(() => { restoredRef.current = true; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save on queue/index changes
  useEffect(() => {
    if (!restoredRef.current) return;
    if (!localStorage.getItem("token")) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const uploadIds = queue.map((t) => t.uploadId);
      saveQueueState(uploadIds, queueIndex).catch((e) =>
        consola.warn("[queue-persistence] save failed", e),
      );
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [queue, queueIndex]);
}
