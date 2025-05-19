import axios from "axios";
import { API_URL } from "../consts";
import { SearchResponse } from "../types/search";

export const search = async (query: string) => {
  const response = await axios.get<SearchResponse>(
    `${API_URL}/search?q=${query}&size=100`
  );
  return response.data;
};
