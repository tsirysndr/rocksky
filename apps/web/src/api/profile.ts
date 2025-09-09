import { client } from ".";
import { Scrobble } from "../types/scrobble";

export const getProfileByDid = async (did: string) => {
  const response = await client.get("/xrpc/app.rocksky.actor.getProfile", {
    params: { did },
  });
  return response.data;
};

export const getProfileStatsByDid = async (did: string) => {
  const response = await client.get("/xrpc/app.rocksky.stats.getStats", {
    params: { did },
  });
  return response.data;
};

export const getRecentTracksByDid = async (
  did: string,
  offset = 0,
  limit = 10,
): Promise<Scrobble[]> => {
  const response = await client.get<{ scrobbles: Scrobble[] }>(
    "/xrpc/app.rocksky.actor.getActorScrobbles",
    {
      params: { did, offset, limit },
    },
  );
  return response.data.scrobbles || [];
};
