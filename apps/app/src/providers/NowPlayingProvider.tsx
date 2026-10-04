import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { authTokenAtom } from "@/src/atoms/auth";
import {
  activeDeviceIdAtom,
  devicesAtom,
  selectedSourceAtom,
} from "@/src/atoms/devices";
import {
  localEngineActiveAtom,
  nowPlayingAtom,
  playbackLockedUntilAtom,
  playerAtom,
  progressAtom,
} from "@/src/atoms/nowplaying";
import { useAudioSettingsAutoLoad } from "@/src/hooks/useAudioSettings";
import { useNavidromeCredentials } from "@/src/hooks/useNavidrome";
import { useNowPlaying } from "@/src/hooks/useNowPlaying";
import { useNowPlayingLike } from "@/src/hooks/useNowPlayingLike";
import { useRemoteDevicesConnection } from "@/src/hooks/useRemoteDevices";
import {
  setupMediaSession,
  syncMediaPosition,
  syncMediaSession,
} from "@/src/lib/mediaSession";
import { remoteBridge } from "@/src/lib/remoteBridge";
import {
  restoreLocalQueue,
  startLocalRemotePlayer,
  stopLocalRemotePlayer,
} from "@/src/lib/uploadEngine";
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
  const selected = useAtomValue(selectedSourceAtom);
  const localEngineActive = useAtomValue(localEngineActiveAtom);
  const lockedUntil = useAtomValue(playbackLockedUntilAtom);
  const setNowPlaying = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);
  const setProgress = useSetAtom(progressAtom);

  const track = activeDeviceId
    ? (devices[activeDeviceId]?.nowPlaying ?? null)
    : null;

  // A remote device keeps reporting its own track while the phone plays
  // locally; writing it here too made the two alternate every poll, which
  // flickered the mini player. The user's pick settles it — and an explicit
  // pick of a device outranks local playback, so switching still works.
  const deviceOwnsDisplay =
    selected?.kind === "device" || (!selected && !localEngineActive);

  useEffect(() => {
    if (!deviceOwnsDisplay) return;
    if (!track) {
      // The chosen device is idle: clear, or the previous device's track would
      // sit there looking current.
      if (selected?.kind === "device") {
        setNowPlaying(null);
        setPlayer(null);
        setProgress(0);
      }
      return;
    }
    const locked = Date.now() < lockedUntil;
    setNowPlaying((prev) => ({
      title: track.title,
      artist: track.artist,
      cover: track.albumArt ?? "",
      duration: track.duration,
      progress: track.elapsed,
      isPlaying: locked && prev ? prev.isPlaying : track.isPlaying,
      liked:
        track.liked ??
        (prev?.uri && prev.uri === track.songUri ? prev.liked : false),
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
    deviceOwnsDisplay,
    selected,
    lockedUntil,
    setNowPlaying,
    setPlayer,
    setProgress,
  ]);

  // Whether the device feed owns the display, so the REST/Spotify poll stands
  // down: an idle but explicitly chosen device counts, otherwise the fallback
  // would fill the placeholder with the user's last scrobble.
  return deviceOwnsDisplay && (!!track || selected?.kind === "device");
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

// Registers this phone on the remote-control socket so other clients can see
// and drive it, and brings back the queue it was playing when it was last
// closed (paused — the engine only reopens on a play).
function useLocalPlayerBroadcast() {
  const token = useAtomValue(authTokenAtom);

  useEffect(() => {
    if (!token) {
      stopLocalRemotePlayer();
      return;
    }
    startLocalRemotePlayer();
    void restoreLocalQueue();
    return () => stopLocalRemotePlayer();
  }, [token]);
}

export const NowPlayingProvider = ({ children }: { children: ReactNode }) => {
  const did = storage.getDid() || "";
  useRemoteDevicesConnection();
  useLocalPlayerBroadcast();
  useNavidromeCredentials();
  useNowPlayingLike();
  // Pull the audio settings record as soon as there is a session, like web:
  // waiting for the settings sheet would show defaults for a moment first.
  useAudioSettingsAutoLoad();
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
