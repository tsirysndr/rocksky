import axios from "axios";
import { API_URL } from "../consts";

export const play = async () => {
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

export const pause = async () => {
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

export const next = async () => {
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

export const previous = async () => {
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

export const seek = async (position_ms: number) => {
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
