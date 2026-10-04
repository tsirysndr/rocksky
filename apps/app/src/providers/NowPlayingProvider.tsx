import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { activeDeviceIdAtom, devicesAtom } from "@/src/atoms/devices";
import {
  localEngineActiveAtom,
  nowPlayingAtom,
  playbackLockedUntilAtom,
  playerAtom,
  progressAtom,
} from "@/src/atoms/nowplaying";
import { useNowPlaying } from "@/src/hooks/useNowPlaying";
import { useRemoteDevicesConnection } from "@/src/hooks/useRemoteDevices";
import {
  setupMediaSession,
  syncMediaPosition,
  syncMediaSession,
} from "@/src/lib/mediaSession";
import { remoteBridge } from "@/src/lib/remoteBridge";
import { storage } from "@/src/storage";

const NowPlayingContext = createContext<
  ReturnType<typeof useNowPlaying>["nowPlaying"] | null
>(null);
const ProgressContext =
  createContext<ReturnType<typeof useNowPlaying>["progress"]>(0);

// Pushes the active remote device's track into the shared now-playing atoms.
// When a device is streaming, it wins over the REST/Spotify polling fallback —
// but never over the in-app engine, which owns the atoms while it plays.
function useActiveDeviceTrack() {
  const devices = useAtomValue(devicesAtom);
  const activeDeviceId = useAtomValue(activeDeviceIdAtom);
  const localEngineActive = useAtomValue(localEngineActiveAtom);
  const lockedUntil = useAtomValue(playbackLockedUntilAtom);
  const setNowPlaying = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);
  const setProgress = useSetAtom(progressAtom);

  const track = activeDeviceId
    ? (devices[activeDeviceId]?.nowPlaying ?? null)
    : null;

  useEffect(() => {
    // A remote device keeps reporting its own track while the phone plays
    // locally. Writing it here too made the two sources alternate every poll,
    // which is what flickered the mini player's title, artist and art.
    if (!track || localEngineActive) return;
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
  }, [
    track,
    localEngineActive,
    lockedUntil,
    setNowPlaying,
    setPlayer,
    setProgress,
  ]);

  return !!track;
}

// Keeps the module-level transport bridge and the Android media notification
// in step with the shared now-playing state.
function useMediaSessionSync(
  nowPlaying: ReturnType<typeof useNowPlaying>["nowPlaying"],
) {
  const player = useAtomValue(playerAtom);
  const activeDeviceId = useAtomValue(activeDeviceIdAtom);

  useEffect(() => {
    setupMediaSession();
  }, []);

  useEffect(() => {
    remoteBridge.setRoute(player, activeDeviceId);
  }, [player, activeDeviceId]);

  const title = nowPlaying?.title;
  const artist = nowPlaying?.artist;
  const cover = nowPlaying?.cover;
  const isPlaying = nowPlaying?.isPlaying ?? false;
  const durationMs = nowPlaying?.duration ?? 0;

  useEffect(() => {
    syncMediaSession(
      title
        ? {
            title,
            artist: artist ?? "",
            cover,
            isPlaying,
            durationMs,
            progressMs: getDefaultStore().get(progressAtom),
          }
        : null,
    );
  }, [title, artist, cover, isPlaying, durationMs]);

  // Keep the notification progress bar honest after remote seeks/reconnects.
  useEffect(() => {
    const store = getDefaultStore();
    const interval = setInterval(() => {
      syncMediaPosition(store.get(progressAtom));
    }, 5000);
    return () => clearInterval(interval);
  }, []);
}

export const NowPlayingProvider = ({ children }: { children: ReactNode }) => {
  const did = storage.getDid() || "";
  useRemoteDevicesConnection();
  const deviceTrackActive = useActiveDeviceTrack();
  // The in-app engine feeds the atoms itself; polling must not clobber it.
  const localEngineActive = useAtomValue(localEngineActiveAtom);
  const { nowPlaying, progress } = useNowPlaying(
    did,
    deviceTrackActive || localEngineActive,
  );
  useMediaSessionSync(nowPlaying);

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
