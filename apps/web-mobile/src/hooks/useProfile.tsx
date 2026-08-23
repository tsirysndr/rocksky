import { RockskyError } from "@rocksky/sdk";
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
import { rocksky } from "../lib/rocksky";

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

// The profile JSON was previously handled untyped (JSON.parse of the raw
// response body); keep the same looseness so downstream usage is unchanged.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProfileData = Record<string, any>;

function useProfile(token?: string | null) {
  const setProfile = useSetAtom(profileAtom);
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const isLoading = !data && !error;

  useEffect(() => {
    if (!token) return;
    const fetchProfile = async () => {
      try {
        const profile = (await rocksky().get(
          "app.rocksky.actor.getProfile",
        )) as ProfileData;
        setData(profile);
        setError(null);
      } catch (e) {
        if (
          e instanceof RockskyError &&
          (e.status === 401 ||
            e.kind === "AuthMissing" ||
            e.kind === "Unauthorized")
        ) {
          localStorage.removeItem("token");
          window.location.href = "/";
          return;
        }
        setError(e as Error);
        setData(null);
      }
    };
    fetchProfile();
  }, [token]);

  useEffect(() => {
    if (data) {
      if (Object.keys(data).length === 0) {
        localStorage.removeItem("token");
        window.location.href = "/";
        return;
      }
      // Keep the logged-in DID in localStorage so own-profile detection
      // (follow button, onboarding, welcome banner) is reliable and synchronous
      // across the layout remounts that happen on every navigation.
      if (data.did) {
        localStorage.setItem("did", data.did);
      }
      setProfile({
        avatar: data.avatar,
        displayName: data.displayName,
        handle: data.handle,
        spotifyUser: { isBeta: data.spotifyUser?.isBetaUser },
        spotifyConnected: data.spotifyConnected,
        did: data.did,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return { data, error, isLoading };
}

export default useProfile;
