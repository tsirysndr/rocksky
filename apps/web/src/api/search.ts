import axios from "axios";
import { API_URL } from "../consts";
import type { SearchResponse } from "../types/search";

export const search = async (query: string): Promise<SearchResponse> => {
  const response = await axios.get<SearchResponse>(
    `${API_URL}/xrpc/app.rocksky.feed.search?query=${encodeURIComponent(query)}&size=100`,
  );
  return response.data;
};
