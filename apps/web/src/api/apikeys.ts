import axios from "axios";
import { API_URL } from "../consts";
import { ApiKey } from "../types/apikey";

// Read at call time, not module-eval time: this module is pulled in by the app
// shell (LibraryPrefetch), so a snapshot taken here would be `Bearer null` for
// anyone who signs in without a full page reload, and stale after a re-login.
const authHeaders = () => ({
  authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const createApiKey = async (name: string, description?: string) => {
  return await axios.post<ApiKey>(
    `${API_URL}/apikeys`,
    { name, description },
    { headers: authHeaders() },
  );
};

export const getApiKeys = async (offset = 0, size = 20) => {
  return await axios.get<ApiKey[]>(`${API_URL}/apikeys`, {
    headers: authHeaders(),
    params: {
      offset,
      size,
    },
  });
};

export const deleteApiKey = async (id: string) => {
  return await axios.delete(`${API_URL}/apikeys/${id}`, {
    headers: authHeaders(),
  });
};

export const updateApiKey = async (
  id: string,
  enabled: boolean,
  name?: string,
  description?: string,
) => {
  return await axios.put<ApiKey>(
    `${API_URL}/apikeys/${id}`,
    { name, description, enabled },
    { headers: authHeaders() },
  );
};
