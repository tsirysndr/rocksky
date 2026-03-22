import { client } from ".";
import { SearchResponse } from "../types/search";

export const search = async (query: string) => {
  const response = await client.get<SearchResponse>(
    "/xrpc/app.rocksky.feed.search",
    {
      params: { query, size: 100 },
    },
  );
  return response.data;
};
