import { useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom, type QueueTrack } from "../atoms/queue";

function trackToNowPlaying(track: QueueTrack, isPlaying = true) {
  return {
    title: track.title,
    artist: track.artist,
    artistUri: "",
    songUri: track.songUri ?? "",
    albumUri: "",
    duration: track.duration,
    progress: 0,
    albumArt: track.albumArt ?? undefined,
    isPlaying,
    sha256: track.sha256,
    liked: false,
  };
}

export function useUploadPlayer() {
  const [queue, setQueue] = useAtom(queueAtom);
  const [queueIndex, setQueueIndex] = useAtom(queueIndexAtom);
  const setNowPlaying = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);

  // Play a list of tracks starting at startIndex.
  // Replaces the current queue entirely.
  const playNow = useCallback(
    (tracks: QueueTrack[], startIndex = 0) => {
      setQueue(tracks);
      setQueueIndex(startIndex);
      setNowPlaying(trackToNowPlaying(tracks[startIndex]));
      setPlayer("upload");
    },
    [setQueue, setQueueIndex, setNowPlaying, setPlayer],
  );

  // Insert a track immediately after the currently playing position.
  const playNext = useCallback(
    (track: QueueTrack) => {
      setQueue((prev) => {
        const next = [...prev];
        next.splice(queueIndex + 1, 0, track);
        return next;
      });
    },
    [setQueue, queueIndex],
  );

  // Insert multiple tracks immediately after the currently playing position.
  const playNextAll = useCallback(
    (tracks: QueueTrack[]) => {
      setQueue((prev) => {
        const next = [...prev];
        next.splice(queueIndex + 1, 0, ...tracks);
        return next;
      });
    },
    [setQueue, queueIndex],
  );

  // Append a track to the end of the queue.
  const playLast = useCallback(
    (track: QueueTrack) => {
      setQueue((prev) => [...prev, track]);
    },
    [setQueue],
  );

  // Append multiple tracks to the end of the queue.
  const playLastAll = useCallback(
    (tracks: QueueTrack[]) => {
      setQueue((prev) => [...prev, ...tracks]);
    },
    [setQueue],
  );

  return { queue, queueIndex, playNow, playNext, playNextAll, playLast, playLastAll };
}
