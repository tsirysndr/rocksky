import axios from "axios";
import { API_URL } from "../consts";
import { storage } from "../storage";

const authHeader = () => ({ Authorization: `Bearer ${storage.getToken()}` });

export const shout = async (uri: string, message: string) => {
  const response = await axios.post(
    `${API_URL}/users/${uri.replace("at://", "")}/shouts`,
    { message },
    { headers: { "Content-Type": "application/json", ...authHeader() } },
  );
  return response.data;
};

export const getShouts = async (uri: string) => {
  const response = await axios.get(
    `${API_URL}/users/${uri.replace("at://", "")}/shouts`,
    { headers: authHeader() },
  );
  return response.data;
};

export const reply = async (uri: string, message: string) => {
  const response = await axios.post(
    `${API_URL}/users/${uri.replace("at://", "")}/replies`,
    { message },
    { headers: { "Content-Type": "application/json", ...authHeader() } },
  );
  return response.data;
};

export const getReplies = async (uri: string) => {
  const response = await axios.get(
    `${API_URL}/users/${uri.replace("at://", "")}/replies`,
  );
  return response.data;
};

export const reportShout = async (uri: string) => {
  const response = await axios.post(
    `${API_URL}/users/${uri.replace("at://", "")}/report`,
    {},
    { headers: authHeader() },
  );
  return response.data;
};

export const deleteShout = async (uri: string) => {
  const response = await axios.delete(
    `${API_URL}/users/${uri.replace("at://", "")}`,
    { headers: authHeader() },
  );
  return response.data;
};

export const cancelReport = async (uri: string) => {
  const response = await axios.delete(
    `${API_URL}/users/${uri.replace("at://", "")}/report`,
    { headers: authHeader() },
  );
  return response.data;
};
