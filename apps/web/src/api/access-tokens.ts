import axios from "axios";
import { API_URL } from "../consts";
import { AccessToken, CreatedAccessToken } from "../types/access-token";

const authHeaders = () => ({
  authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const createAccessToken = async (name: string) =>
  axios.post<CreatedAccessToken>(
    `${API_URL}/access-tokens`,
    { name },
    { headers: authHeaders() },
  );

export const getAccessTokens = async (offset = 0, size = 50) =>
  axios.get<AccessToken[]>(`${API_URL}/access-tokens`, {
    headers: authHeaders(),
    params: { offset, size },
  });

export const deleteAccessToken = async (id: string) =>
  axios.delete(`${API_URL}/access-tokens/${id}`, { headers: authHeaders() });
