import axios from "axios";
import { API_URL } from "../consts";

function useSpotify() {
  const play = async () => {
    await axios.put(`${API_URL}/spotify/play`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
  };
  const pause = async () => {
    await axios.put(`${API_URL}/spotify/pause`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
  };
  const next = async () => {
    await axios.post(`${API_URL}/spotify/next`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
  };
  const previous = async () => {
    await axios.post(`${API_URL}/spotify/previous`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
  };
  const seek = async (position_ms: number) => {
    await axios.put(`${API_URL}/spotify/seek`, {}, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      params: { position_ms },
    });
  };
  return { play, pause, next, previous, seek };
}

export default useSpotify;
