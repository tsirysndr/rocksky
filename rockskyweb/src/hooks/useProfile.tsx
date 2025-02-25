import axios from "axios";
import { useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { profileAtom } from "../atoms/profile";
import { API_URL } from "../consts";
import { Scrobble } from "../types/scrobble";

function useProfile(token?: string | null) {
  const setProfile = useSetAtom(profileAtom);
  const navigate = useNavigate();
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const isLoading = !data && !error;

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
