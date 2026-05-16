import axios from "axios";
import { API_URL } from "../consts";

export const search = async (query: string): Promise<{ hits: any[] }> => {
  const response = await axios.get(`${API_URL}/xrpc/app.rocksky.feed.search`, {
    params: { query, size: 100 },
  });
  return response.data;
};
