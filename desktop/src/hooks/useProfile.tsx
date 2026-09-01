import { RockskyError } from "@rocksky/sdk";
import { useQuery } from "@tanstack/react-query";
import consola from "consola";
import { useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import {
  getActorCompatibility,
  getActorNeighbours,
  getGlobalStats,
  getProfileByDid,
  getProfileStatsByDid,
  getRecentTracksByDid,
} from "../api/profile";
import { profileAtom } from "../atoms/profile";
import { syncSessionToken } from "../lib/native-session";
import { rocksky } from "../lib/rocksky";

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
    // refetchInterval: 4500,
  });

export const useGlobalStatsQuery = () =>
  useQuery({
    queryKey: ["stats", "global"],
    queryFn: () => getGlobalStats(),
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

export const useActorCompatibilityQuery = (did: string | undefined) =>
  useQuery({
    queryKey: ["profile", "compatibility", did],
    queryFn: () => getActorCompatibility(did!),
    enabled: !!did,
  });

function useProfile(token?: string | null) {
  const setProfile = useSetAtom(profileAtom);
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const isLoading = !data && !error;

  useEffect(() => {
    if (!token) {
      return;
    }

    const fetchProfile = async () => {
      try {
        // No params — the viewer identity comes from the bearer token the
        // shared client attaches.
        const profile = await rocksky().get("app.rocksky.actor.getProfile");
        setData(JSON.stringify(profile));
        setError(null);
      } catch (e) {
        if (
          e instanceof RockskyError &&
          (e.status === 401 ||
            e.kind === "AuthMissing" ||
            e.kind === "Unauthorized")
        ) {
          // Mirror the old raw-fetch sentinel so the token-clearing/redirect
          // logic below stays identical.
          setData("Unauthorized");
          setError(null);
        } else if (e instanceof RockskyError && e.status === 500) {
          setData("Internal Server Error");
          setError(null);
        } else {
          setError(e as Error);
          setData(null);
        }
      }
    };
    fetchProfile();
  }, [token]);

  useEffect(() => {
    if (data !== "Unauthorized" && data !== "Internal Server Error" && data) {
      const profile = JSON.parse(data);
      if (Object.keys(profile).length === 0) {
        localStorage.removeItem("token");
        syncSessionToken();
        window.location.href = "/";
        return;
      }
      // Keep the logged-in DID in localStorage so own-profile detection
      // (follow button, onboarding, welcome banner) is reliable and synchronous
      // across the layout remounts that happen on every navigation.
      if (profile.did) {
        localStorage.setItem("did", profile.did);
      }
      setProfile({
        avatar: profile.avatar,
        displayName: profile.displayName,
        handle: profile.handle,
        spotifyUser: {
          isBeta: profile.spotifyUser?.isBetaUser,
        },
        spotifyConnected: profile.spotifyConnected,
        did: profile.did,
        googledriveUser: {
          isBeta: profile.googledrive?.isBetaUser,
        },
        dropboxUser: {
          isBeta: profile.dropbox?.isBetaUser,
        },
      });
    }

    if (
      !data ||
      data === "Unauthorized" ||
      data === "Internal Server Error" ||
      (error && localStorage.getItem("token"))
    ) {
      if (data === "Unauthorized") {
        consola.log(">> Unauthorized");
        localStorage.removeItem("token");
        syncSessionToken();
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (
    !data ||
    data === "Unauthorized" ||
    data === "Internal Server Error" ||
    (error && localStorage.getItem("token"))
  ) {
    if (data === "Unauthorized" && localStorage.getItem("token")) {
      consola.log(">> error", error, ">> data", data); // localStorage.clear();
      window.location.href = "/";
    }
    return {
      data: null,
      error,
      isLoading,
      getProfileByDid,
      getProfileStatsByDid,
      getRecentTracksByDid,
    };
  }

  return {
    data: JSON.parse(data),
    error,
    isLoading,
  };
}

export default useProfile;
