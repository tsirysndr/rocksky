import { useQuery } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import {
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
  });

export const useProfileStatsByDidQuery = (did: string) =>
  useQuery({
    queryKey: ["profile", "stats", did],
    queryFn: () => getProfileStatsByDid(did),
    enabled: !!did,
    refetchInterval: 4500,
  });

export const useRecentTracksByDidQuery = (did: string, offset = 0, size = 10) =>
  useQuery({
    queryKey: ["profile", "recent-tracks", did, offset, size],
    queryFn: () => getRecentTracksByDid(did, offset, size),
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
        const response = await fetch(`${API_URL}/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }).then((res) => res.text());
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
    if (data !== "Unauthorized" && data !== "Internal Server Error" && data) {
      const profile = JSON.parse(data);
      setProfile({
        avatar: `https://cdn.bsky.app/img/avatar/plain/${localStorage.getItem(
          "did"
        )}/${profile.avatar.ref["$link"]}@jpeg`,
        displayName: profile.displayName,
        handle: profile.handle,
        spotifyUser: {
          isBeta: profile.spotifyUser?.is_beta_user,
        },
        spotifyConnected: profile.spotifyConnected,
        did: profile.did,
        googledriveUser: {
          isBeta: profile.googledrive?.is_beta_user,
        },
        dropboxUser: {
          isBeta: profile.dropbox?.is_beta_user,
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
        console.log(">> Unauthorized");
        localStorage.removeItem("token");
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
      console.log(">> error", error, ">> data", data); // localStorage.clear();
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
