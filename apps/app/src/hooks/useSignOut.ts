import { useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { authTokenAtom } from "../atoms/auth";
import { followsAtom } from "../atoms/follows";
import {
  localEngineActiveAtom,
  nowPlayingAtom,
  playerAtom,
  progressAtom,
} from "../atoms/nowplaying";
import { profileAtom } from "../atoms/profile";
import { stopLocalPlayback } from "../lib/uploadEngine";
import { cancelUploadSession } from "../lib/uploadQueue";
import { storage } from "../storage";
export function useSignOut() {
  const client = useQueryClient();
  const setToken = useSetAtom(authTokenAtom);
  const setProfile = useSetAtom(profileAtom);
  const setFollows = useSetAtom(followsAtom);
  const setTrack = useSetAtom(nowPlayingAtom);
  const setPlayer = useSetAtom(playerAtom);
  const setActive = useSetAtom(localEngineActiveAtom);
  const setProgress = useSetAtom(progressAtom);
  return async () => {
    cancelUploadSession();
    stopLocalPlayback();
    setToken(null);
    setProfile(null);
    setFollows(new Set());
    setTrack(null);
    setPlayer(null);
    setActive(false);
    setProgress(0);
    await client.cancelQueries();
    client.clear();
    await storage.clear();
  };
}
