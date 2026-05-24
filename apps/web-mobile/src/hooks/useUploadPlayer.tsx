import { useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom, type QueueTrack } from "../atoms/queue";

function toNowPlaying(track: QueueTrack) {
  return {
    title: track.title,
    artist: track.artist,
    artistUri: "",
    songUri: track.songUri ?? "",
    albumUri: "",
    duration: track.duration,
    progress: 0,
    albumArt: track.albumArt ?? undefined,
    isPlaying: true,
    sha256: track.sha256,
    liked: false,
  };
}

export function useUploadPlayer() {
  const [queue, setQueue] = useAtom(queueAtom);
  const [queueIndex, setQueueIndex] = useAtom(queueIndexAtom);
  const setNowPlaying = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);

  const playNow = useCallback(
    (tracks: QueueTrack[], startIndex = 0) => {
      setQueue(tracks);
      setQueueIndex(startIndex);
      setNowPlaying(toNowPlaying(tracks[startIndex]));
      setPlayer("upload");
    },
    [setQueue, setQueueIndex, setNowPlaying, setPlayer],
  );

  const playNext = useCallback(
    (track: QueueTrack) => {
      setQueue((prev) => {
        const next = [...prev];
        next.splice(queueIndex + 1, 0, track);
        return next;
      });
    },
    [queueIndex, setQueue],
  );

  const playLast = useCallback(
    (track: QueueTrack) => {
      setQueue((prev) => [...prev, track]);
    },
    [setQueue],
  );

  const playNextAll = useCallback(
    (tracks: QueueTrack[]) => {
      setQueue((prev) => {
        const next = [...prev];
        next.splice(queueIndex + 1, 0, ...tracks);
        return next;
      });
    },
    [queueIndex, setQueue],
  );

  const playLastAll = useCallback(
    (tracks: QueueTrack[]) => {
      setQueue((prev) => [...prev, ...tracks]);
    },
    [setQueue],
  );

  return { queue, queueIndex, playNow, playNext, playLast, playNextAll, playLastAll };
}
