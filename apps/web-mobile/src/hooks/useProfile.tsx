import { useQuery } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useEffect, useState } from "react";
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

export const useRecentTracksByDidQuery = (
  did: string,
  offset = 0,
  size = 10,
) =>
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

function useProfile(token?: string | null) {
  const setProfile = useSetAtom(profileAtom);
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const isLoading = !data && !error;

  useEffect(() => {
    if (!token) return;
    const fetchProfile = async () => {
      try {
        const response = await fetch(
          `${API_URL}/xrpc/app.rocksky.actor.getProfile`,
          { headers: { Authorization: `Bearer ${token}` } },
        ).then((res) => res.text());
        setData(response);
        setError(null);
      } catch (e) {
        setError(e as Error);
        setData(null);
      }
    };
    fetchProfile();
  }, [token]);

  useEffect(() => {
    if (data && data !== "Unauthorized" && data !== "Internal Server Error") {
      const profile = JSON.parse(data);
      if (Object.keys(profile).length === 0) {
        localStorage.removeItem("token");
        window.location.href = "/";
        return;
      }
      setProfile({
        avatar: profile.avatar,
        displayName: profile.displayName,
        handle: profile.handle,
        spotifyUser: { isBeta: profile.spotifyUser?.isBetaUser },
        spotifyConnected: profile.spotifyConnected,
        did: profile.did,
      });
    }
    if (data === "Unauthorized") {
      localStorage.removeItem("token");
      window.location.href = "/";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return { data: data && data !== "Unauthorized" && data !== "Internal Server Error" ? JSON.parse(data) : null, error, isLoading };
}

export default useProfile;
