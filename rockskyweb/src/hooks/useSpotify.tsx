import axios from "axios";
import { API_URL } from "../consts";

function useSpotify() {
  const play = async () => {
    const response = await axios.put(
      `${API_URL}/spotify/play`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };

  const pause = async () => {
    const response = await axios.put(
      `${API_URL}/spotify/pause`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };

  const next = async () => {
    const response = await axios.post(
      `${API_URL}/spotify/next`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };

  const previous = async () => {
    const response = await axios.post(
      `${API_URL}/spotify/previous`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );
    return response.data;
  };

  const seek = async (position_ms: number) => {
    const response = await axios.put(
      `${API_URL}/spotify/seek`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        params: {
          position_ms,
        },
      }
    );
    return response.data;
  };

  return {
    play,
    pause,
    next,
    previous,
    seek,
  };
}

export default useSpotify;
