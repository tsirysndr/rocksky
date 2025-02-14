import axios from "axios";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import useSWR from "swr";
import { profileAtom } from "../atoms/profile";
import { API_URL } from "../consts";
import { Scrobble } from "../types/scrobble";

function useProfile() {
  const setProfile = useSetAtom(profileAtom);
  const navigate = useNavigate();

  const getProfileByDid = async (did: string) => {
    try {
      const response = await axios.get(`${API_URL}/users/${did}`);
      return response.data;
    } catch {
      navigate("/");
      return null;
    }
  };

  const getProfileStatsByDid = async (did: string) => {
    const response = await axios.get(`${API_URL}/users/${did}/stats`);
    return response.data;
  };

  const getRecentTracksByDid = async (
    did: string,
    offset = 0,
    size = 10
  ): Promise<Scrobble[]> => {
    const response = await axios.get<Scrobble[]>(
      `${API_URL}/users/${did}/scrobbles?size=${size}&offset=${offset}`
    );
    return response.data;
  };

  const fetcher = (path: string) =>
    fetch(`${API_URL}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")!}`,
      },
    }).then((res) => res.text());

  const { data, error, isLoading } = useSWR("/profile", fetcher, {
    errorRetryCount: 5,
    errorRetryInterval: 1000,
  });

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
      });
    }

    if (
      !data ||
      data === "Unauthorized" ||
      data === "Internal Server Error" ||
      (error && localStorage.getItem("token"))
    ) {
      if (data === "Unauthorized") {
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
      localStorage.clear();
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
    getProfileByDid,
    getProfileStatsByDid,
    getRecentTracksByDid,
  };
}

export default useProfile;
