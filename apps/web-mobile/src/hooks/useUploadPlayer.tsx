import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { InsertMode } from "rockbox-wasm";
import { nowPlayingAtom } from "../atoms/nowpaying";
import { playerAtom } from "../atoms/player";
import { queueAtom, queueIndexAtom, type QueueTrack } from "../atoms/queue";
import { ensureStreamToken } from "../api/uploads";
import {
  ensureRockboxReady,
  registerTracks,
  streamUrlFor,
} from "../lib/audio/rockbox-engine";

// useUploadPlayer — orchestrates the in-browser rockbox-wasm queue for the
// "My Library" (upload) player. Playback + DSP + crossfade run locally in wasm;
// there is no <audio> element, no HLS and no remote server. The queue atoms are
// kept in sync by the engine's queue/status events (see useRockboxEngine).

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
  const queue = useAtomValue(queueAtom);
  const queueIndex = useAtomValue(queueIndexAtom);
  const setNowPlaying = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);

  const playNow = useCallback(
    async (tracks: QueueTrack[], startIndex = 0) => {
      if (!tracks.length) return;
      setNowPlaying(toNowPlaying(tracks[startIndex]));
      setPlayer("upload");
      // Boot the engine FIRST, synchronously within the click's user gesture.
      // Creating the AudioContext after an awaited network call (the stream
      // token) lands outside the gesture, and Chrome then rejects the worklet
      // load with "Unable to load a worklet's module".
      const p = await ensureRockboxReady();
      await ensureStreamToken();
      registerTracks(tracks);
      const urls = tracks.map(streamUrlFor);
      // Start ONLY the chosen track so playback begins as fast as possible —
      // the engine downloads/decodes just this one file.
      p.setQueue([urls[startIndex]], true);
      // Then fill the rest of the queue in the background. These are URL
      // strings only: the engine fetches each subsequent track lazily when it's
      // reached, so nothing else downloads up front. insert() renumbers the
      // current index and never restarts the playing track, so the album keeps
      // its natural order with the chosen track current.
      const after = urls.slice(startIndex + 1);
      const before = urls.slice(0, startIndex);
      if (after.length) p.insert(after, InsertMode.PlayLast);
      if (before.length) p.insert(before, InsertMode.Prepend);
    },
    [setNowPlaying, setPlayer],
  );

  const playNext = useCallback(async (track: QueueTrack) => {
    const p = await ensureRockboxReady();
    await ensureStreamToken();
    registerTracks([track]);
    p.insert(streamUrlFor(track), InsertMode.PlayNext);
  }, []);

  const playLast = useCallback(async (track: QueueTrack) => {
    const p = await ensureRockboxReady();
    await ensureStreamToken();
    registerTracks([track]);
    p.insert(streamUrlFor(track), InsertMode.PlayLast);
  }, []);

  const playNextAll = useCallback(async (tracks: QueueTrack[]) => {
    if (!tracks.length) return;
    const p = await ensureRockboxReady();
    await ensureStreamToken();
    registerTracks(tracks);
    p.insert(tracks.map(streamUrlFor), InsertMode.PlayNext);
  }, []);

  const playLastAll = useCallback(async (tracks: QueueTrack[]) => {
    if (!tracks.length) return;
    const p = await ensureRockboxReady();
    await ensureStreamToken();
    registerTracks(tracks);
    p.insert(tracks.map(streamUrlFor), InsertMode.PlayLast);
  }, []);

  return { queue, queueIndex, playNow, playNext, playLast, playNextAll, playLastAll };
}
