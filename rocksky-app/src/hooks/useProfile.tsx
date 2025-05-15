import { useQuery } from "@tanstack/react-query";
import {
  getProfileByDid,
  getProfileStatsByDid,
  getRecentTracksByDid,
} from "../api/profile";

export const useProfileByDidQuery = (did: string) =>
  useQuery({
    queryKey: ["profile", did],
    queryFn: () => getProfileByDid(did),
  });

export const useProfileStatsByDidQuery = (did: string) =>
  useQuery({
    queryKey: ["profile", "stats", did],
    queryFn: () => getProfileStatsByDid(did),
    enabled: !!did,
  });

export const useRecentTracksByDidQuery = (did: string, offset = 0, size = 10) =>
  useQuery({
    queryKey: ["profile", "recent-tracks", did, offset, size],
    queryFn: () => getRecentTracksByDid(did, offset, size),
    enabled: !!did,
  });
