import axios from "axios";
import { API_URL } from "../consts";
import { storage } from "../storage";

export const like = async (uri: string) => {
  const response = await axios.post(
    `${API_URL}/users/${uri.replace("at://", "")}/likes`,
    {},
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${storage.getToken()}`,
      },
    },
  );
  return response.data;
};

export const unlike = async (uri: string) => {
  const response = await axios.delete(
    `${API_URL}/users/${uri.replace("at://", "")}/likes`,
    { headers: { Authorization: `Bearer ${storage.getToken()}` } },
  );
  return response.data;
};

export const getLikes = async (uri: string) => {
  const response = await axios.get(
    `${API_URL}/users/${uri.replace("at://", "")}/likes`,
  );
  return response.data;
};
