import axios from "axios";
import { API_URL } from "../consts";
import { ApiKey } from "../types/apikey";

function useApikey() {
  const headers = {
    authorization: `Bearer ${localStorage.getItem("token")}`,
  };

  const createApiKey = async (name: string, description?: string) => {
    return await axios.post<ApiKey>(
      `${API_URL}/apikeys`,
      { name, description },
      { headers }
    );
  };

  const getApiKeys = async (offset = 0, size = 20) => {
    return await axios.get<ApiKey[]>(`${API_URL}/apikeys`, {
      headers,
      params: {
        offset,
        size,
      },
    });
  };

  const deleteApiKey = async (id: string) => {
    return await axios.delete(`${API_URL}/apikeys/${id}`, { headers });
  };

  const updateApiKey = async (
    id: string,
    enabled: boolean,
    name?: string,
    description?: string
  ) => {
    return await axios.put<ApiKey>(
      `${API_URL}/apikeys/${id}`,
      { name, description, enabled },
      { headers }
    );
  };

  return { createApiKey, getApiKeys, deleteApiKey, updateApiKey };
}

export default useApikey;
