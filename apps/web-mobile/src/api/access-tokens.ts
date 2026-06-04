import { client } from ".";
import { AccessToken, CreatedAccessToken } from "../types/access-token";

const getHeaders = () => ({
  authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const createAccessToken = async (name: string) =>
  client.post<CreatedAccessToken>(
    "/access-tokens",
    { name },
    { headers: getHeaders() },
  );

export const getAccessTokens = async (offset = 0, size = 50) =>
  client.get<AccessToken[]>("/access-tokens", {
    headers: getHeaders(),
    params: { offset, size },
  });

export const deleteAccessToken = async (id: string) =>
  client.delete(`/access-tokens/${id}`, { headers: getHeaders() });
