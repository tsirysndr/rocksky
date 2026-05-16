import { useQuery } from "@tanstack/react-query";
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
    queryFn: () => getProfileStatsByDid(did!),
    enabled: !!did,
  });

export const useRecentTracksByDidQuery = (did: string, offset = 0, size = 10) =>
  useQuery({
    queryKey: ["profile", "recent-tracks", did, offset, size],
    queryFn: () => getRecentTracksByDid(did, offset, size),
    enabled: !!did,
  });

export const useActorNeighboursQuery = (did: string) =>
  useQuery({
    queryKey: ["profile", "neighbours", did],
    queryFn: () => getActorNeighbours(did),
    enabled: !!did,
  });

export function useCurrentUserProfile(token?: string | null) {
  const setProfile = useSetAtom(profileAtom);

  useEffect(() => {
    if (!token) return;
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API_URL}/xrpc/app.rocksky.actor.getProfile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        if (text === "Unauthorized" || text === "Internal Server Error") return;
        const profile = JSON.parse(text);
        if (!Object.keys(profile).length) return;
        setProfile({
          avatar: profile.avatar,
          displayName: profile.displayName,
          handle: profile.handle,
          did: profile.did,
          spotifyUser: profile.spotifyUser
            ? { isBeta: profile.spotifyUser.isBetaUser }
            : undefined,
          spotifyConnected: profile.spotifyConnected,
        });
      } catch {}
    };
    fetch_();
  }, [token]);
}
