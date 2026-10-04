import { useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { authTokenAtom } from "../atoms/auth";
import {
  activeDeviceIdAtom,
  devicesAtom,
  remoteCommandsAtom,
  selectedSourceAtom,
} from "../atoms/devices";
import { followsAtom } from "../atoms/follows";
import {
  localEngineActiveAtom,
  nowPlayingAtom,
  playerAtom,
  progressAtom,
} from "../atoms/nowplaying";
import { profileAtom } from "../atoms/profile";
import { remoteBridge } from "../lib/remoteBridge";
import { stopLocalPlayback } from "../lib/uploadEngine";
import { cancelUploadSession } from "../lib/uploadQueue";
import { storage } from "../storage";
export function useSignOut() {
  const client = useQueryClient();
  const setToken = useSetAtom(authTokenAtom);
  const setDevices = useSetAtom(devicesAtom);
  const setDevice = useSetAtom(activeDeviceIdAtom);
  const setSource = useSetAtom(selectedSourceAtom);
  const setCommands = useSetAtom(remoteCommandsAtom);
  const setProfile = useSetAtom(profileAtom);
  const setFollows = useSetAtom(followsAtom);
  const setTrack = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);
  const setActive = useSetAtom(localEngineActiveAtom);
  const setProgress = useSetAtom(progressAtom);
  return async () => {
    // Hide authenticated playback UI before native or asynchronous cleanup.
    setToken(null);
    const clearingStorage = storage.clear();
    setDevices({});
    setDevice(null);
    setSource(null);
    setCommands(null);
    remoteBridge.setController(null);
    remoteBridge.setRoute(null, null);
    cancelUploadSession();
    stopLocalPlayback();
    setProfile(null);
    setFollows(new Set());
    setTrack(null);
    setPlayer(null);
    setActive(false);
    setProgress(0);
    await client.cancelQueries();
    client.clear();
    await clearingStorage;
  };
}
