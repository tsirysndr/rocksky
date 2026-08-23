import { rocksky } from "../lib/rocksky";
import type { SearchResponse } from "../types/search";

export const search = async (query: string): Promise<SearchResponse> => {
  const response = await rocksky().get("app.rocksky.feed.search", {
    query,
    size: 100,
  });
  return response as SearchResponse;
};
