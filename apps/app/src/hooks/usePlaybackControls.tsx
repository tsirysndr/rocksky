import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { activeDeviceIdAtom, remoteCommandsAtom } from "../atoms/devices";
import {
  nowPlayingAtom,
  playbackLockedUntilAtom,
  playerAtom,
  progressAtom,
} from "../atoms/nowplaying";
import { remoteBridge } from "../lib/remoteBridge";
import { toggleLocalLike } from "../lib/uploadEngine";
import { useLikeMutation, useUnlikeMutation } from "./useLike";

// One place for transport controls: every action goes through the module
// bridge, which routes to the active remote device or the Spotify REST API.
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

  const playPause = useCallback(() => {
    if (!nowPlaying) {
      // Nothing shown yet but a device is selected: just ask it to play.
      if (player !== "spotify") remoteBridge.send("play");
      return;
    }
    remoteBridge.togglePlayPause();
  }, [nowPlaying, player]);

  const next = useCallback(() => {
    remoteBridge.send("next");
  }, []);

  const previous = useCallback(() => {
    remoteBridge.send("previous");
  }, []);

  const seek = useCallback(
    (positionMs: number) => {
      const position = Math.max(0, Math.round(positionMs));
      setLockedUntil(Date.now() + 1500);
      setProgress(position);
      setNowPlaying((prev) => (prev ? { ...prev, progress: position } : null));
      remoteBridge.send("seek", position);
    },
    [setLockedUntil, setProgress, setNowPlaying],
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
    // The in-app engine owns this: a navidrome track has no AT-URI to like by,
    // so it stars the Subsonic id instead and the heart did nothing here.
    if (player === "local") {
      void toggleLocalLike();
      return;
    }
    if (!nowPlaying?.uri) return;
    const liked = nowPlaying.liked;
    setNowPlaying((prev) => (prev ? { ...prev, liked: !liked } : null));
    if (liked) unlikeTrack(nowPlaying.uri);
    else likeTrack(nowPlaying.uri);
  }, [nowPlaying, player, setNowPlaying, likeTrack, unlikeTrack]);

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
