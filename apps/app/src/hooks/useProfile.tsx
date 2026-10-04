import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import {
  getActorNeighbours,
  getProfileByDid,
  getProfileStatsByDid,
  getRecentTracksByDid,
} from "../api/profile";
import { profileAtom } from "../atoms/profile";
import { API_URL } from "../consts";

export const useProfileByDidQuery = (did: string) =>
  useQuery({
    queryKey: ["profile", did],
    queryFn: () => getProfileByDid(did),
    enabled: !!did,
  });

export const useProfileStatsByDidQuery = (did: string | undefined) =>
  useQuery({
    queryKey: ["profile", "stats", did],
    queryFn: () => getProfileStatsByDid(did ?? ""),
    enabled: !!did,
  });

export const useRecentTracksByDidQuery = (did: string, offset = 0, size = 10) =>
  useQuery({
    queryKey: ["profile", "recent-tracks", did, offset, size],
    queryFn: () => getRecentTracksByDid(did, offset, size),
    enabled: !!did,
  });

export const useRecentTracksByDidInfiniteQuery = (did: string, size = 20) =>
  useInfiniteQuery({
    queryKey: ["profile", "recent-tracks", "infinite", did, size],
    queryFn: async ({ pageParam }) => {
      const tracks = await getRecentTracksByDid(did, pageParam, size);
      return { tracks, offset: pageParam };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.tracks.length < size
        ? undefined
        : lastPage.offset + lastPage.tracks.length,
    enabled: !!did,
  });

export const useActorNeighboursQuery = (did: string) =>
  useQuery({
    queryKey: ["profile", "neighbours", did],
    queryFn: () => getActorNeighbours(did),
    enabled: !!did,
  });

type MeResponse = {
  avatar?: string;
  displayName?: string;
  handle?: string;
  did?: string;
  createdAt?: string;
  spotifyUser?: { isBetaUser?: boolean };
  spotifyConnected?: boolean;
};

/**
 * The signed-in user's own profile, cached like every other read.
 *
 * It was a bare fetch in an effect, so it ran again on every remount and
 * nothing else could share the result; the endpoint also answers with a plain
 * error string rather than a status, hence the text check.
 */
export function useCurrentUserProfile(token?: string | null) {
  const setProfile = useSetAtom(profileAtom);

  const { data } = useQuery({
    queryKey: ["profile", "me", token],
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<MeResponse | null> => {
      const res = await fetch(`${API_URL}/xrpc/app.rocksky.actor.getProfile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      if (text === "Unauthorized" || text === "Internal Server Error") {
        return null;
      }
      try {
        const profile = JSON.parse(text) as MeResponse;
        return Object.keys(profile).length ? profile : null;
      } catch {
        return null;
      }
    },
  });

  useEffect(() => {
    if (!data?.handle || !data.did) return;
    setProfile({
      avatar: data.avatar ?? "",
      displayName: data.displayName ?? data.handle,
      handle: data.handle,
      did: data.did,
      createdAt: data.createdAt,
      spotifyUser: data.spotifyUser
        ? { isBeta: data.spotifyUser.isBetaUser === true }
        : undefined,
      spotifyConnected: data.spotifyConnected,
    });
  }, [data, setProfile]);
}
