import { useAtomValue, useSetAtom } from "jotai";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { activeDeviceIdAtom, devicesAtom } from "@/src/atoms/devices";
import {
  nowPlayingAtom,
  playbackLockedUntilAtom,
  playerAtom,
  progressAtom,
} from "@/src/atoms/nowplaying";
import { useNowPlaying } from "@/src/hooks/useNowPlaying";
import { useRemoteDevicesConnection } from "@/src/hooks/useRemoteDevices";
import { storage } from "@/src/storage";

const NowPlayingContext = createContext<
  ReturnType<typeof useNowPlaying>["nowPlaying"] | null
>(null);
const ProgressContext =
  createContext<ReturnType<typeof useNowPlaying>["progress"]>(0);

// Pushes the active remote device's track into the shared now-playing atoms.
// When a device is streaming, it wins over the REST/Spotify polling fallback.
function useActiveDeviceTrack() {
  const devices = useAtomValue(devicesAtom);
  const activeDeviceId = useAtomValue(activeDeviceIdAtom);
  const lockedUntil = useAtomValue(playbackLockedUntilAtom);
  const setNowPlaying = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);
  const setProgress = useSetAtom(progressAtom);

  const track = activeDeviceId
    ? (devices[activeDeviceId]?.nowPlaying ?? null)
    : null;

  useEffect(() => {
    if (!track) return;
    const locked = Date.now() < lockedUntil;
    setNowPlaying((prev) => ({
      title: track.title,
      artist: track.artist,
      cover: track.albumArt ?? "",
      duration: track.duration,
      progress: track.elapsed,
      isPlaying: locked && prev ? prev.isPlaying : track.isPlaying,
      liked: track.liked ?? prev?.liked ?? false,
      uri: track.songUri ?? "",
      album: track.album,
      artistUri: track.artistUri,
      albumUri: track.albumUri,
      shuffle: track.shuffle,
      repeat: track.repeat,
    }));
    setPlayer("rockbox");
    // Smooth toward the device's position: snap on seeks (>2s error), nudge
    // forward by 25% of the error otherwise — never move backwards.
    setProgress((prev) => {
      const err = track.elapsed - prev;
      if (Math.abs(err) > 2000) return track.elapsed;
      return err > 0 ? prev + err * 0.25 : prev;
    });
  }, [track, lockedUntil, setNowPlaying, setPlayer, setProgress]);

  return !!track;
}

export const NowPlayingProvider = ({ children }: { children: ReactNode }) => {
  const did = storage.getDid() || "";
  useRemoteDevicesConnection();
  const deviceTrackActive = useActiveDeviceTrack();
  const { nowPlaying, progress } = useNowPlaying(did, deviceTrackActive);

  // biome-ignore lint/correctness/useExhaustiveDependencies: consumers only re-render on track/playing/liked changes, not on every poll tick
  const memoizedNowPlaying = useMemo(
    () => nowPlaying,
    [nowPlaying?.uri, nowPlaying?.isPlaying, nowPlaying?.liked],
  );

  return (
    <NowPlayingContext.Provider value={memoizedNowPlaying}>
      <ProgressContext.Provider value={progress}>
        {children}
      </ProgressContext.Provider>
    </NowPlayingContext.Provider>
  );
};

export const useNowPlayingContext = () => {
  const ctx = useContext(NowPlayingContext);
  return ctx;
};

export const useProgressContext = () => {
  return useContext(ProgressContext);
};
