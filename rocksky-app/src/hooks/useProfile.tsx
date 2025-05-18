import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
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
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

export const useRecentTracksByDidQuery = (did: string, offset = 0, size = 10) =>
  useQuery({
    queryKey: ["profile", "recent-tracks", did, offset, size],
    queryFn: () => getRecentTracksByDid(did, offset, size),
    enabled: !!did,
    refetchInterval: 6000,
    refetchOnWindowFocus: true,
  });

export const useRecentTracksByDidInfiniteQuery = (did: string, size = 20) =>
  useInfiniteQuery({
    queryKey: ["profile", "recent-tracks", did],
    queryFn: async ({ pageParam = 0 }) => {
      const data = await getRecentTracksByDid(did, pageParam * size, size);
      return {
        tracks: data,
        nextOffset: pageParam + 1,
      };
    },
    getNextPageParam: (lastPage) => {
      return lastPage.tracks.length < size ? undefined : lastPage.nextOffset;
    },
    initialPageParam: 0,
    refetchOnMount: false,
  });
