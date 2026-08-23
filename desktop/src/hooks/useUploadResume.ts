import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom, type QueueTrack } from "../atoms/queue";
import { uploadResumeAtom } from "../atoms/resume";
import { getQueueState, type PersistedQueueTrack } from "../api/uploads";
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

// A track that inherited a URL tail as its title (persisted by an earlier
// bug when the URL->metadata registry missed). Real titles never look like
// a stream path/query.
function looksDegraded(t: QueueTrack): boolean {
  const title = t.title ?? "";
  return (
    title === "" ||
    title.startsWith("stream?") ||
    title.includes("?token=") ||
    title.includes("?u=") ||
    title.startsWith("http://") ||
    title.startsWith("https://")
  );
}

/** Repair degraded tracks from the server-persisted queue (uploadId-keyed);
 *  entries that can't be repaired are dropped so junk never renders again. */
async function repairQueue(tracks: QueueTrack[]): Promise<QueueTrack[]> {
  if (!tracks.some(looksDegraded)) return tracks;
  let byId = new Map<string, PersistedQueueTrack>();
  try {
    const server = await getQueueState();
    byId = new Map(server.queue.map((t) => [t.uploadId, t]));
  } catch {
    // no server copy — degraded entries are dropped below
  }
  const repaired: QueueTrack[] = [];
  for (const t of tracks) {
    if (!looksDegraded(t)) {
      repaired.push(t);
      continue;
    }
    const fixed = t.uploadId ? byId.get(t.uploadId) : undefined;
    if (fixed) {
      repaired.push({
        uploadId: fixed.uploadId,
        title: fixed.title,
        artist: fixed.artist,
        albumArtist: fixed.albumArtist,
        album: fixed.album,
        albumArt: fixed.albumArt,
        duration: fixed.duration,
        sha256: fixed.sha256,
        songUri: fixed.songUri,
      });
    }
  }
  return repaired;
}


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
    void (async () => {
    const queue = await repairQueue(r.queue);
    if (!queue.length) return; // nothing restorable — clean slate
    if (queue !== r.queue) {
      // Persist the cleaned snapshot so the junk never comes back.
      setResume({ queue, index: 0, progressMs: 0 });
    }
    const savedTrack = r.queue[Math.min(Math.max(0, r.index), r.queue.length - 1)];
    // Re-locate the resumed track in the (possibly shrunk) repaired queue.
    const located = savedTrack
      ? queue.findIndex((q) => q.uploadId === savedTrack.uploadId)
      : -1;
    const idx = located >= 0 ? located : Math.min(Math.max(0, r.index), queue.length - 1);
    const t = queue[idx];
    if (!t) return;
    registerTracks(queue); // so the engine can map URLs → metadata on play
    setQueue(queue);
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
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Snapshot the queue + position periodically (and on unmount / tab hide).
  useEffect(() => {
    const write = () => {
      if (playerRef.current !== "rockbox") return;
      const q = queueRef.current;
      const np = npRef.current;
      if (!q.length || !np) return;
      // A transient -1 index (engine stopped/booting) must never overwrite
      // the saved position — that made resume restart at the first track.
      if (idxRef.current < 0) return;
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
