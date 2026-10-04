import axios from "axios";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { activeDeviceIdAtom, remoteCommandsAtom } from "../atoms/devices";
import {
  nowPlayingAtom,
  playbackLockedUntilAtom,
  playerAtom,
  progressAtom,
} from "../atoms/nowplaying";
import { API_URL } from "../consts";
import { storage } from "../storage";
import { useLikeMutation, useUnlikeMutation } from "./useLike";

const authHeaders = () => ({
  headers: { Authorization: `Bearer ${storage.getToken()}` },
});

// One place for transport controls: routes each action to the active remote
// device (WebSocket command) or to the Spotify REST endpoints.
export function usePlaybackControls() {
  const [nowPlaying, setNowPlaying] = useAtom(nowPlayingAtom);
  const player = useAtomValue(playerAtom);
  const commands = useAtomValue(remoteCommandsAtom);
  const activeDeviceId = useAtomValue(activeDeviceIdAtom);
  const setLockedUntil = useSetAtom(playbackLockedUntilAtom);
  const setProgress = useSetAtom(progressAtom);
  const { mutate: likeTrack } = useLikeMutation();
  const { mutate: unlikeTrack } = useUnlikeMutation();

  const target = activeDeviceId ?? undefined;

  const lockPlayback = useCallback(() => {
    const lockUntil = Date.now() + 1500;
    setLockedUntil(lockUntil);
  }, [setLockedUntil]);

  const playPause = useCallback(async () => {
    if (!nowPlaying) {
      // Nothing shown yet but a device is selected: just ask it to play.
      if (player !== "spotify" && commands)
        commands.send("play", undefined, target);
      return;
    }
    const wasPlaying = nowPlaying.isPlaying;
    lockPlayback();
    setNowPlaying((prev) =>
      prev ? { ...prev, isPlaying: !prev.isPlaying } : null,
    );
    if (player === "spotify") {
      try {
        await axios.put(
          `${API_URL}/spotify/${wasPlaying ? "pause" : "play"}`,
          {},
          authHeaders(),
        );
      } catch {
        setNowPlaying((prev) =>
          prev ? { ...prev, isPlaying: wasPlaying } : null,
        );
      }
      return;
    }
    commands?.send(wasPlaying ? "pause" : "play", undefined, target);
  }, [nowPlaying, player, commands, target, lockPlayback, setNowPlaying]);

  const next = useCallback(async () => {
    if (player === "spotify") {
      try {
        await axios.post(`${API_URL}/spotify/next`, {}, authHeaders());
      } catch {}
      return;
    }
    commands?.send("next", undefined, target);
  }, [player, commands, target]);

  const previous = useCallback(async () => {
    if (player === "spotify") {
      try {
        await axios.post(`${API_URL}/spotify/previous`, {}, authHeaders());
      } catch {}
      return;
    }
    commands?.send("previous", undefined, target);
  }, [player, commands, target]);

  const seek = useCallback(
    (positionMs: number) => {
      const position = Math.max(0, Math.round(positionMs));
      setProgress(position);
      setNowPlaying((prev) => (prev ? { ...prev, progress: position } : null));
      if (player === "spotify") {
        axios
          .put(
            `${API_URL}/spotify/seek?position_ms=${position}`,
            {},
            authHeaders(),
          )
          .catch(() => {});
        return;
      }
      commands?.send("seek", { position }, target);
    },
    [player, commands, target, setProgress, setNowPlaying],
  );

  const setShuffle = useCallback(
    (enabled: boolean) => {
      setNowPlaying((prev) => (prev ? { ...prev, shuffle: enabled } : null));
      commands?.send("shuffle", { enabled }, target);
    },
    [commands, target, setNowPlaying],
  );

  const setRepeat = useCallback(
    (mode: "off" | "one" | "all") => {
      setNowPlaying((prev) => (prev ? { ...prev, repeat: mode } : null));
      commands?.send("repeat", { mode }, target);
    },
    [commands, target, setNowPlaying],
  );

  const queueJump = useCallback(
    (index: number) => {
      commands?.send("queue_jump", { index }, target);
    },
    [commands, target],
  );

  const queueRemove = useCallback(
    (index: number) => {
      commands?.send("queue_remove", { index }, target);
    },
    [commands, target],
  );

  const toggleLike = useCallback(() => {
    if (!nowPlaying?.uri) return;
    const liked = nowPlaying.liked;
    setNowPlaying((prev) => (prev ? { ...prev, liked: !liked } : null));
    if (liked) unlikeTrack(nowPlaying.uri);
    else likeTrack(nowPlaying.uri);
  }, [nowPlaying, setNowPlaying, likeTrack, unlikeTrack]);

  return {
    playPause,
    next,
    previous,
    seek,
    setShuffle,
    setRepeat,
    queueJump,
    queueRemove,
    toggleLike,
  };
}
