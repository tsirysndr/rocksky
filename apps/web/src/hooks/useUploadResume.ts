import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom } from "../atoms/queue";
import { uploadResumeAtom } from "../atoms/resume";
import { registerTracks } from "../lib/audio/rockbox-engine";

// useUploadResume — persist the in-browser upload queue + position to
// localStorage and restore it on reload.
//
// On mount (once) it rehydrates the queue, the current index and the elapsed
// time into the player atoms (paused). The engine itself is only (re)loaded
// when the user presses play — see the resume branch in StickyPlayer's onPlay,
// which rebuilds the engine queue at the saved index and seeks to the saved
// elapsed time. While the upload player is active it snapshots every few
// seconds (and on unmount) so a reload loses at most a few seconds of position.

const PERSIST_INTERVAL_MS = 3000;

export function useUploadResume() {
  const [resume, setResume] = useAtom(uploadResumeAtom);
  const setQueue = useSetAtom(queueAtom);
  const setQueueIndex = useSetAtom(queueIndexAtom);
  const setNowPlaying = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);

  const player = useAtomValue(playerAtom);
  const queue = useAtomValue(queueAtom);
  const queueIndex = useAtomValue(queueIndexAtom);
  const nowPlaying = useAtomValue(nowPlayingAtom);

  const restoredRef = useRef(false);
  const resumeRef = useRef(resume);
  const playerRef = useRef(player);
  const queueRef = useRef(queue);
  const idxRef = useRef(queueIndex);
  const npRef = useRef(nowPlaying);
  resumeRef.current = resume;
  playerRef.current = player;
  queueRef.current = queue;
  idxRef.current = queueIndex;
  npRef.current = nowPlaying;

  // Restore once on mount.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const r = resumeRef.current;
    if (!r || !r.queue?.length) return;
    const idx = Math.min(Math.max(0, r.index), r.queue.length - 1);
    const t = r.queue[idx];
    if (!t) return;
    registerTracks(r.queue); // so the engine can map URLs → metadata on play
    setQueue(r.queue);
    setQueueIndex(idx);
    setNowPlaying({
      title: t.title,
      artist: t.artist,
      artistUri: "",
      songUri: t.songUri ?? "",
      albumUri: "",
      duration: t.duration,
      progress: r.progressMs || 0,
      albumArt: t.albumArt ?? undefined,
      isPlaying: false,
      sha256: t.sha256,
      liked: false,
    });
    setPlayer("rockbox");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Snapshot the queue + position periodically (and on unmount / tab hide).
  useEffect(() => {
    const write = () => {
      if (playerRef.current !== "rockbox") return;
      const q = queueRef.current;
      const np = npRef.current;
      if (!q.length || !np) return;
      setResume({ queue: q, index: idxRef.current, progressMs: np.progress || 0 });
    };
    const id = window.setInterval(write, PERSIST_INTERVAL_MS);
    window.addEventListener("pagehide", write);
    return () => {
      write();
      clearInterval(id);
      window.removeEventListener("pagehide", write);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setResume]);
}
