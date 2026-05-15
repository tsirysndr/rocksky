import { client } from ".";

export const search = async (query: string) => {
  const response = await client.get("/xrpc/app.rocksky.feed.search", {
    params: { query, size: 100 },
  });
  return response.data;
};
