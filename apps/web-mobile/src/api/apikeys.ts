import { ApiKey } from "../types/apikey";
import { client } from ".";

const getHeaders = () => ({
  authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const createApiKey = async (name: string, description?: string) => {
  return await client.post<ApiKey>("/apikeys", { name, description }, { headers: getHeaders() });
};

export const getApiKeys = async (offset = 0, size = 20) => {
  return await client.get<ApiKey[]>("/apikeys", {
    headers: getHeaders(),
    params: { offset, size },
  });
};

export const deleteApiKey = async (id: string) => {
  return await client.delete(`/apikeys/${id}`, { headers: getHeaders() });
};

export const updateApiKey = async (
  id: string,
  enabled: boolean,
  name?: string,
  description?: string,
) => {
  return await client.put<ApiKey>(
    `/apikeys/${id}`,
    { name, description, enabled },
    { headers: getHeaders() },
  );
};
