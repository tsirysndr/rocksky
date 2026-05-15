import { client } from ".";

export const getScrobbleByUri = async (uri: string) => {
  if (uri.includes("app.rocksky.song")) return null;
  const response = await client.get("/xrpc/app.rocksky.scrobble.getScrobble", {
    params: { uri },
  });
  if (response.status !== 200) return null;
  return response.data;
};

export const getFeedGenerators = async () => {
  const response = await client.get("/xrpc/app.rocksky.feed.getFeedGenerators");
  if (response.status !== 200) return null;
  return response.data;
};

export const getFeed = async (uri: string, limit?: number, cursor?: string) => {
  const response = await client.get<{
    feed: { scrobble: Record<string, unknown> }[];
    cursor?: string;
  }>("/xrpc/app.rocksky.feed.getFeed", {
    params: { feed: uri, limit, cursor },
    headers: {
      Authorization: localStorage.getItem("token")
        ? `Bearer ${localStorage.getItem("token")}`
        : undefined,
    },
  });
  if (response.status !== 200) return { songs: [], cursor: undefined };
  return {
    songs: response.data.feed.map(({ scrobble }) => scrobble),
    cursor: response.data.cursor,
  };
};

export const getScrobbles = async (
  did: string,
  following = false,
  offset = 0,
  limit = 30,
) => {
  const response = await client.get("/xrpc/app.rocksky.scrobble.getScrobbles", {
    params: { did, following, offset, limit },
    headers: {
      Authorization: localStorage.getItem("token")
        ? `Bearer ${localStorage.getItem("token")}`
        : undefined,
    },
  });
  if (response.status !== 200) return { scrobbles: [] };
  return { scrobbles: response.data.scrobbles };
};
